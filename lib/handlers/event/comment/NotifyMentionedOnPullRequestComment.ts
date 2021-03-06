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
import {
    failure,
    Success,
} from "@atomist/automation-client/lib/HandlerResult";
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import { NotifyMentionedOnPullRequestComment } from "../../../typings/types";
import { prNotification } from "../../../util/notifications";

export function notifyMentionedOnPullRequestComment(): EventHandlerRegistration<NotifyMentionedOnPullRequestComment.Subscription> {
    return {
        name: "NotifyMentionedOnPullRequestComment",
        description: "Notify mentioned user in slack",
        tags: ["lifecycle", "pr comment", "notification"],
        subscription: subscription("notifyMentionedOnPullRequestComment"),
        listener: async (e, ctx) => {
            const comment = e.data.Comment[0];
            const pr = comment.pullRequest;

            if (pr) {
                return prNotification(`${pr.number}/${comment._id}`, "New mention in comment on pull request",
                    comment.body, comment.by, pr as any, pr.repo as any, ctx, [])
                    .then(() => Success, failure);
            } else {
                return Promise.resolve(Success);
            }
        },
    };
}
