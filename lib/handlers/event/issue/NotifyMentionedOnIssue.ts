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
import {
    failure,
    Success,
    SuccessPromise,
} from "@atomist/automation-client/lib/HandlerResult";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import { NotifyMentionedOnIssue } from "../../../typings/types";
import {
    issueAssigneeNotification,
    issueNotification,
} from "../../../util/notifications";

export function notifyMentionedOnIssue(): EventHandlerRegistration<NotifyMentionedOnIssue.Subscription> {
    return {
        name: "NotifyMentionedOnIssue",
        description: "Notify mentioned user in slack",
        tags: ["lifecycle", "issue", "notification"],
        subscription: subscription("notifyMentionedOnIssue"),
        listener: async (e, ctx) => {
            const issue = e.data.Issue[0];
            const repo = issue.repo;

            if (issue.number) {
                return issueNotification(issue.number.toString(), "New mention in issue",
                    issue.body, issue.openedBy.login, issue, repo, ctx, [])
                    .then(_ => {
                        if (!!issue.assignees) {
                            return Promise.all(issue.assignees.map(a =>
                                issueAssigneeNotification(issue.number.toString(), "New assignment of issue", issue.body,
                                    a, issue, repo, ctx)));
                        } else {
                            return Promise.resolve(null);
                        }
                    })
                    .then(() => Success, failure);
            } else {
                return SuccessPromise;
            }
        },
    };
}
