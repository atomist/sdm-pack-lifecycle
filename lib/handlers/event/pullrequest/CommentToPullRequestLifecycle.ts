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
 * Send a lifecycle message on Comment events.
 */
export function commentToPullRequestLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.CommentToPullRequestLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "CommentToPullRequestLifecycle",
        description: "Send a PR lifecycle message on Comment events",
        tags: ["lifecycle", "pr", "comment"],
        parameters: LifecycleParameters,
        subscription: subscription("commentToPullRequestLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.CommentToPullRequestLifecycle.Subscription>(
                e,
                params,
                e.data.Comment[0]?.pullRequest?.repo,
                ctx,
                () => new PullRequestLifecycleHandler(
                    ev => {
                        const pr = _.get(ev, "data.Comment[0].pullRequest");
                        return [pr, _.get(pr, "repo"), Date.now().toString(), true];
                    },
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Comment[0].pullRequest.repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}

/**
 * Send a lifecycle card on Comment events.
 */
export function commentToPullRequestCardLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.CommentToPullRequestLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "CommentToPullRequestCardLifecycle",
        description: "Send a pr lifecycle card on Branch events",
        tags: ["lifecycle", "pr", "comment"],
        parameters: LifecycleParameters,
        subscription: subscription("commentToPullRequestLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.CommentToPullRequestLifecycle.Subscription>(
                e,
                params,
                e.data.Comment[0]?.pullRequest?.repo,
                ctx,
                () => new PullRequestCardLifecycleHandler(
                    ev => {
                        const pr = _.get(ev, "data.Comment[0].pullRequest");
                        return [pr, _.get(pr, "repo"), Date.now().toString(), true];
                    },
                    contributions,
                ),
            );
        },
    };
}
