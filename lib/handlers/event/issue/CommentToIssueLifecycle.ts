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
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import { IssueCardLifecycleHandler } from "./IssueLifecycle";

/**
 * Send a lifecycle card on Comment events.
 */
export function commentToIssueCardLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.CommentToIssueLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "CommentToIssueCardLifecycle",
        description: "Send a issue lifecycle card on Comment events",
        tags: ["lifecycle", "issue", "comment"],
        parameters: LifecycleParameters,
        subscription: subscription("commentToIssueLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.CommentToIssueLifecycle.Subscription>(
                e,
                params,
                e.data.Comment[0]?.issue?.repo,
                ctx,
                () => new IssueCardLifecycleHandler(
                    ev => {
                        const issue = _.get(ev.data, "Comment[0].issue");
                        return [issue, _.get(ev.data, "Comment[0].issue.repo"), _.get(ev.data, "Comment[0]"),
                            (issue ? Date.parse(issue.timestamp).toString() : Date.now().toString())];
                    },
                    contributions,
                ),
            );
        },
    };
}
