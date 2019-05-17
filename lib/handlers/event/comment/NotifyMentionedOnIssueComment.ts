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
    failure,
    GraphQL,
    Success,
} from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
import { NotifyMentionedOnIssueComment } from "../../../typings/types";
import { issueNotification } from "../../../util/notifications";

export function notifyMentionedOnIssueComment(): EventHandlerRegistration<NotifyMentionedOnIssueComment.Subscription> {
    return {
        name: "NotifyMentionedOnIssueComment",
        description: "Notify mentioned user in slack",
        tags: ["lifecycle", "issue comment", "notification"],
        subscription: GraphQL.subscription("notifyMentionedOnIssueComment"),
        listener: async (e, ctx) => {
            const comment = e.data.Comment[0];
            const issue = comment.issue;

            if (issue) {
                const repo = issue.repo;
                return issueNotification(`${issue.number}/${comment._id}`, "New mention in comment on issue",
                    comment.body, comment.by.login, issue, repo, ctx, [])
                    .then(() => Success, failure);
            } else {
                return Promise.resolve(Success);
            }
        },
    };
}
