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
 * Send a lifecycle message on Issue events.
 */
export function issueToIssueCommentLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.IssueToIssueCommentLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "IssueToIssueCommentLifecycle",
        description: "Send an issue comment lifecycle message on issue events",
        tags: ["lifecycle", "issue", "comment"],
        parameters: LifecycleParameters,
        subscription: subscription("issueToIssueCommentLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.IssueToIssueCommentLifecycle.Subscription>(
                e,
                params,
                e.data.Issue[0]?.repo,
                ctx,
                () => new CommentLifecycleHandler(
                    ev => {
                        const issue = ev.data.Issue[0];
                        if (!!issue) {
                            return [issue.comments.sort((c1, c2) =>
                                c1.timestamp.localeCompare(c2.timestamp)), issue, null, _.get(issue, "repo"), true];
                        } else {
                            return [null, null, null, null, true];
                        }
                    },
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Issue[0].repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}
