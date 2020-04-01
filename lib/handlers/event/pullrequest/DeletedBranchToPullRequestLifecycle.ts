/*
 * Copyright © 2020 Atomist, Inc.
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
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import * as _ from "lodash";
import {
    lifecycle,
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import { chatTeamsToPreferences } from "../../../lifecycle/util";
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import {
    PullRequestCardLifecycleHandler,
    PullRequestLifecycleHandler,
} from "./PullRequestLifecycle";

/**
 * Send a lifecycle message on DeletedBranch events.
 */
export function deletedBranchToPullRequestLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.DeletedBranchToPullRequestLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "DeletedBranchToPullRequestLifecycle",
        description: "Send a PR lifecycle message on DeletedBranch events",
        tags: ["lifecycle", "pr", "deleted branch"],
        parameters: LifecycleParameters,
        subscription: subscription("deletedBranchToPullRequestLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.DeletedBranchToPullRequestLifecycle.Subscription>(
                e,
                params,
                e.data.DeletedBranch[0].pullRequests[0].repo,
                ctx,
                () => new PullRequestLifecycleHandler(
                    ev => {
                        const pr = _.get(ev, "data.DeletedBranch[0].pullRequests[0]");
                        return [pr, _.get(pr, "repo"), Date.now().toString(), true];
                    },
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.DeletedBranch[0].pullRequests[0].repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}

/**
 * Send a lifecycle card on DeletedBranch events.
 */
export function deletedBranchToPullRequestCardLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.DeletedBranchToPullRequestLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "DeletedBranchToPullRequestCardLifecycle",
        description: "Send a pr lifecycle card on DeletedBranch events",
        tags: ["lifecycle", "pr", "deleted branch"],
        parameters: LifecycleParameters,
        subscription: subscription("deletedBranchToPullRequestLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.DeletedBranchToPullRequestLifecycle.Subscription>(
                e,
                params,
                e.data.DeletedBranch[0].pullRequests[0].repo,
                ctx,
                () => new PullRequestCardLifecycleHandler(
                    ev => {
                        const pr = _.get(ev, "data.DeletedBranch[0].pullRequests[0]");
                        return [pr, _.get(pr, "repo"), Date.now().toString(), true];
                    },
                    contributions,
                ),
            );
        },
    };
}
