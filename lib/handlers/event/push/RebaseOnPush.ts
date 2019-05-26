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
    GitProject,
    GraphQL,
    logger,
    QueryNoCacheOptions,
    Success,
} from "@atomist/automation-client";
import {
    EventHandlerRegistration,
    execPromise,
    isLazyProjectLoader,
    LazyProject,
    ParametersDefinition,
    resolveCredentialsPromise,
    SoftwareDeliveryMachineOptions,
} from "@atomist/sdm";
import {
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import {
    PullRequestByRepoAndBranch,
    PushToBranch,
} from "../../../typings/types";

type RebaseOnPushParametersDefinition = { configuration: SoftwareDeliveryMachineOptions } & LifecycleParametersDefinition;

export const RebaseOnPushParameters: ParametersDefinition<RebaseOnPushParametersDefinition> = {

    ...LifecycleParameters,

    configuration: {
        path: "sdm",
        required: false,
    },
};

/**
 * Event handler to automatically rebase a PR branch when pushes to the base branch occur
 */
export const RebaseOnPush: EventHandlerRegistration<PushToBranch.Subscription, RebaseOnPushParametersDefinition> = {
    name: "RebaseOnPush",
    description: "",
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
            const credentials = await resolveCredentialsPromise(params.credentialsResolver.eventHandlerCredentials(ctx));

            for (const pr of prs.PullRequest) {
                await params.configuration.projectLoader.doWithProject<void>(
                    {
                        context: ctx,
                        readOnly: false,
                        id: params.configuration.repoRefResolver.toRemoteRepoRef(pr.repo, {}),
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
                            await execPromise("git", ["rebase", `origin/${pr.baseBranchName}`], { cwd: p.baseDir });
                            await execPromise("git", ["push", "origin", pr.branchName, "--force"], { cwd: p.baseDir });
                        } catch (e) {
                            logger.warn("Failed to rebase PR: %s", e.message);
                        }
                    });
            }
        }

        return Success;
    },
};
