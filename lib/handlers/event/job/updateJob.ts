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
    GraphQL,
    SourceDestination,
    Success,
} from "@atomist/automation-client";
import { Source } from "@atomist/automation-client/lib/internal/transport/RequestProcessor";
import {
    EventHandlerRegistration,
    SdmGoalState,
    slackInfoMessage,
    slackSuccessMessage,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { formatDuration } from "@atomist/sdm-core/lib/util/misc/time";
import {
    codeBlock,
    italic,
    SlackMessage,
} from "@atomist/slack-messages";
import {
    AtmJobTaskState,
    UpdateOnJob,
} from "../../../typings/types";

export function updateOnJob(sdm: SoftwareDeliveryMachine): EventHandlerRegistration<UpdateOnJob.Subscription> {
    return {
        name: "UpdateOnJob",
        description: "Update a summary message on any job update",
        subscription: GraphQL.subscription({
            name: "OnAnyJob",
        }),
        listener: async (e, ctx) => {
            const job = e.data.AtmJob[0];
            const trigger = JSON.parse(job.data).source as Source;
            const owner = job.owner;
            const totalCount = job.jobCount;
            const count = job.completedCount;
            const name = job.name;
            const createdAt = new Date(job.createdAt).getTime();
            const updatedAt = new Date(job.updatedAt).getTime();
            const failedTasks = job.jobTasks.filter(t => t.state === AtmJobTaskState.failed);

            let state;
            switch (job.state) {
                case "running":
                    state = SdmGoalState.in_process;
                    break;
                case "completed":
                    state = SdmGoalState.success;
                    break;
            }
            const url = `https://badge.atomist.com/v2/progress/${state}/${count}/${totalCount}`;

            let body = "";
            if (failedTasks.length > 0) {
                body = `

${failedTasks.length} ${failedTasks.length === 1 ? "task" : "tasks"} of ${totalCount} failed:
${failedTasks.map(ft => ft.message).filter(m => !!m && m.length > 0).map(codeBlock).join("\n")}`;
            }

            let msg: SlackMessage;
            let color: string;
            if (job.state === "running") {
                msg = slackInfoMessage(
                    "Job Progress",
                    `Running job ${italic(name)}${body}`);
                color = "#2A7D7D";
            } else {
                msg = slackSuccessMessage(
                    "Job Progress",
                    `Completed job ${italic(name)}${body}`);
                color = "#37A745";
            }

            msg.attachments[0].thumb_url = url;
            msg.attachments[0].footer = `${owner} \u00B7 ${formatDuration(updatedAt - createdAt)}`;
            msg.attachments[0].color = color;

            await ctx.messageClient.send(msg, new SourceDestination(trigger, trigger.user_agent), { id: `atomist/sdm/job/${job.id}` });
            return Success;
        },
    };
}
