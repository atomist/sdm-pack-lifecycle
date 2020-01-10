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

import { subscription } from "@atomist/automation-client/lib/graph/graphQL";
import { EventFired } from "@atomist/automation-client/lib/HandleEvent";
import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import {
    failure,
    HandlerResult,
    success,
} from "@atomist/automation-client/lib/HandlerResult";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import * as _ from "lodash";
import {
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import {
    LifecycleOptions,
} from "../../../lifecycleSupport";
import {
    LastCommitOnBranch,
    PushToPushLifecycle,
    RepoOnboarded,
} from "../../../typings/types";
import { pushToPushCardLifecycle } from "../push/PushToPushLifecycle";

export function repositoryOnboarded(options: LifecycleOptions)
    : EventHandlerRegistration<RepoOnboarded.Subscription, LifecycleParametersDefinition> {
    return {
        name: "RepositoryOnboarded",
        description: "Send a Push lifecycle card when a new repo has finished onboarding",
        tags: "enrollment",
        parameters: LifecycleParameters,
        subscription: subscription("repoOnboarded"),
        listener: async (e, ctx, params) => {
            const repo = e.data.RepoOnboarded[0].repo;
            const promises: Array<Promise<HandlerResult>> = [];

            const commitResult = await ctx.graphClient.query<LastCommitOnBranch.Query,
                LastCommitOnBranch.Variables>({
                name: "lastCommitOnBranch",
                variables: {
                    name: repo.name,
                    owner: repo.owner,
                    branch: repo.defaultBranch,
                },
            });
            const commit = _.get(commitResult, "Repo[0].branches[0].commit");
            if (commit) {
                promises.push(processCommit(commit, repo, e, ctx, params, options));
            }

            return Promise.all(promises)
                .then(success, failure);
        },
    };
}

function processCommit(commit: LastCommitOnBranch.Commit,
                       repo: RepoOnboarded.Repo,
                       event: EventFired<RepoOnboarded.Subscription>,
                       ctx: HandlerContext,
                       params: LifecycleParametersDefinition,
                       options: LifecycleOptions): Promise<HandlerResult> {
    const push: PushToPushLifecycle.Push = {
        after: commit,
        commits: [commit],
        builds: [],
        branch: repo.defaultBranch,
        repo,
        timestamp: commit.timestamp,
    };

    return pushToPushCardLifecycle(options.push.web).listener({
            data: {
                Push: [push],
            },
            extensions: {
                ...event.extensions,
                operationName: pushToPushCardLifecycle(options.push.web).name,
            },
            secrets: {
                ...event.secrets,
            },
        },
        ctx,
        params);
}
