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
    addressWeb,
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
    SlackMessage,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import {
    AtmJobTaskState,
    UpdateOnJobTask,
} from "../../../typings/types";

export function updateOnJobTask(sdm: SoftwareDeliveryMachine): EventHandlerRegistration<UpdateOnJobTask.Subscription> {
    return {
        name: "UpdateOnJobTask",
        description: "Update a summary message on any job task update",
        subscription: GraphQL.subscription({
            name: "UpdateOnJobTask",
        }),
        listener: async (e, ctx) => {
            const job: UpdateOnJobTask.Job = _.get(e.data, "AtmJobTask[0].job");
            if (!job) {
                return Success;
            }

            const trigger = JSON.parse(job.data).source as Source;
            if (!trigger || !trigger.user_agent) {
                return Success;
            }

            // Don't show progress for single task job
            if (job.jobCount <= 1) {
                return Success;
            }

            const owner = job.owner;
            const totalCount = job.jobCount;
            const count = job.completedCount;
            const name = job.name;
            const description = job.description;
            const createdAt = new Date(job.createdAt).getTime();
            const updatedAt = new Date(job.updatedAt).getTime();

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

            let msg: SlackMessage;
            let color: string;
            if (job.state === "running") {
                msg = slackInfoMessage(
                    "Job Progress",
                    description);
                color = "#2A7D7D";
            } else {
                msg = slackSuccessMessage(
                    "Job Summary",
                    description);
                color = "#37A745";
            }

            msg.attachments[0].thumb_url = url;
            msg.attachments[0].footer = `${owner} \u00B7 ${name} \u00B7 ${formatDuration(updatedAt - createdAt)}`;
            msg.attachments[0].color = color;

            await ctx.messageClient.send(msg, new SourceDestination(trigger, trigger.user_agent), { id: `atomist/sdm/job/${job.id}` });
            await ctx.messageClient.send(msg, addressWeb(), { id: `atomist/sdm/job/${job.id}` });
            return Success;
        },
    };
}
