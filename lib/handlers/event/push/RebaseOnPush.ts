/*
 * Copyright © 2019 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
    GraphQL,
    logger,
    ProjectOperationCredentials,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    execPromise,
    isLazyProjectLoader,
    ParametersDefinition,
    resolveCredentialsPromise,
    SoftwareDeliveryMachineOptions,
} from "@atomist/sdm";
import { codeLine } from "@atomist/slack-messages";
import {
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import {
    PullRequestByRepoAndBranch,
    PushToBranch,
} from "../../../typings/types";
import { truncateCommitMessage } from "../../../util/helpers";

type RebaseOnPushParametersDefinition = { configuration: SoftwareDeliveryMachineOptions } & LifecycleParametersDefinition;

export const RebaseOnPushParameters: ParametersDefinition<RebaseOnPushParametersDefinition> = {

    ...LifecycleParameters,

    configuration: {
        path: "sdm",
        required: false,
    },
};

export type PullRequestCommentCreator<T> = (pr: PullRequestByRepoAndBranch.PullRequest, credentials: ProjectOperationCredentials, body: string) => Promise<T>;
export type PullRequestCommentUpdater<T> = (comment: T, credentials: ProjectOperationCredentials, body: string) => Promise<void>;

/**
 * Event handler to automatically rebase a PR branch when pushes to the base branch occur
 */
export function rebaseOnPush<T>(options: { commentCreator?: PullRequestCommentCreator<T>, commentUpdater?: PullRequestCommentUpdater<T> } = {})
    : EventHandlerRegistration<PushToBranch.Subscription, RebaseOnPushParametersDefinition> {
    return {
        name: "RebaseOnPush",
        description: "Auto rebase a PR branch when pushes to the base branch occur",
        tags: [],
        parameters: RebaseOnPushParameters,
        subscription: GraphQL.subscription("pushToBranch"),
        listener: async (e, ctx, params) => {
            const push = e.data.Push[0];
            // Check if there is an open PR against the branch this push is on
            const prs = await ctx.graphClient.query<PullRequestByRepoAndBranch.Query, PullRequestByRepoAndBranch.Variables>({
                name: "pullRequestByRepoAndBranch",
                variables: {
                    owner: push.repo.owner,
                    repo: push.repo.name,
                    branch: push.branch,
                },
                options: QueryNoCacheOptions,
            });

            if (!!prs && !!prs.PullRequest) {

                const commits = push.commits.map(c => `- ${c.sha.slice(0, 7)} _${truncateCommitMessage(c.message, push.repo)}_`).join("\n");

                for (const pr of prs.PullRequest) {

                    const id = params.configuration.repoRefResolver.toRemoteRepoRef(pr.repo, {});
                    const credentials = await resolveCredentialsPromise(params.credentialsResolver.eventHandlerCredentials(ctx, id));

                    let comment: T;
                    if (!!options.commentCreator) {
                        comment = await options.commentCreator(
                            pr,
                            credentials,
                            `Pull request rebase is in progress because @${push.after.author.login} pushed ${push.commits.length} ${
                                push.commits.length === 1 ? "commit" : "commits"} to **${push.branch}**:
${commits}`);
                    }

                    await params.configuration.projectLoader.doWithProject<void>(
                        {
                            context: ctx,
                            readOnly: false,
                            id,
                            credentials,
                            cloneOptions: {
                                alwaysDeep: true,
                                detachHead: false,
                            },
                        }, async p => {

                            // Trigger project materialization if needed
                            if (isLazyProjectLoader(params.configuration.projectLoader) && !(p as any).materialized()) {
                                await (p as any).materialize();
                            }

                            try {
                                await execPromise("git", ["checkout", pr.branchName], { cwd: p.baseDir });
                            } catch (e) {
                                logger.warn("Failed to checkout PR branch: %s", e.message);

                                if (!!options.commentUpdater) {
                                    await options.commentUpdater(
                                        comment,
                                        credentials,
                                        `Pull request rebase failed because branch **${pr.branchName}** couldn't be checked out.`);
                                }
                                return;
                            }
                            try {
                                await execPromise("git", ["rebase", `origin/${pr.baseBranchName}`], { cwd: p.baseDir });
                            } catch (e) {
                                logger.warn("Failed to rebase PR branch: %s", e.message);

                                const result = await execPromise("git", ["diff", "--name-only", "--diff-filter=U"], { cwd: p.baseDir });
                                const conflicts = result.stdout.trim().split("\n");

                                if (!!options.commentUpdater) {
                                    await options.commentUpdater(
                                        comment,
                                        credentials,
                                        `Pull request rebase to ${codeLine(push.after.sha.slice(0, 7))} by @${
                                            push.after.author.login} failed because of following conflicting ${conflicts.length === 1 ? "file" : "files"}:
${conflicts.map(c => `- ${codeLine(c)}`).join("\n")}`);
                                }
                                return;
                            }

                            try {
                                await execPromise("git", ["push", "origin", pr.branchName, "--force"], { cwd: p.baseDir });
                            } catch (e) {
                                logger.warn("Failed to force push PR branch: %s", e.message);

                                if (!!options.commentUpdater) {
                                    await options.commentUpdater(
                                        comment,
                                        credentials,
                                        `Pull request rebase failed because force push to **${pr.branchName}** errored.`);
                                }
                                return;
                            }

                            if (!!options.commentUpdater) {
                                await options.commentUpdater(
                                    comment,
                                    credentials,
                                    `Pull request was successfully rebased onto ${codeLine(push.after.sha.slice(0, 7))} by @${push.after.author.login}:
${commits}`);
                            }

                        });
                }
            }

            return Success;
        },
    };
}
