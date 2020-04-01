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
import { CommentLifecycleHandler } from "./CommentLifecycle";

/**
 * Send a lifecycle message on Comment events.
 */
export function commentToIssueCommentLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.CommentToIssueCommentLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "CommentToIssueCommentLifecycle",
        description: "Send an issue comment lifecycle message on Comment events",
        tags: ["lifecycle", "issue comment", "comment"],
        parameters: LifecycleParameters,
        subscription: subscription("commentToIssueCommentLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.CommentToIssueCommentLifecycle.Subscription>(
                e,
                params,
                e.data?.Comment[0]?.issue?.repo,
                ctx,
                () => new CommentLifecycleHandler(
                    ev => {
                        const comment = _.get(ev, "data.Comment[0]");
                        return [[comment], _.get(comment, "issue"), null, _.get(comment, "issue.repo"), false];
                    },
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Comment[0].issue.repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}
