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
    buttonForCommand,
    guid,
} from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    createJob,
    slackQuestionMessage,
} from "@atomist/sdm";
import {
    codeLine,
    italic,
} from "@atomist/slack-messages";

interface SetTargetParameters {
    data: string;
    raisePr?: string;
}

export function setTargetCommand(): CommandHandlerRegistration<SetTargetParameters> {
    return {
        name: "SetTarget",
        description: "Broadcast a set new target job",
        parameters: {
            data: {},
            raisePr: { required: false },
        },
        listener: async ci => {
            const msgId = guid();
            const data = JSON.parse(ci.parameters.data);

            if (ci.parameters.raisePr === undefined) {
                await ci.context.messageClient.respond(
                    slackQuestionMessage(
                        "Set as Target",
                        `Do you want to raise pull requests for new target ${italic(data.displayName)} ${codeLine(data.displayValue)} on all affected repositories?`, {
                            actions: [
                                buttonForCommand({ text: "Yes",
                                    confirm: {
                                        title: "Raise Pull Requests",
                                        text: `Are you sure that you want to raise pull requests for new target ${data.displayName} ${data.displayValue} on all affected repositories?`,
                                        ok_text: "Yes",
                                        dismiss_text: "Cancel",
                                    },
                                }, "SetTarget", { ...ci.parameters, raisePr: "true" }),
                                buttonForCommand({ text: "No" }, "SetTarget", { ...ci.parameters, raisePr: "false" }),
                            ],
                        }),
                    { id: msgId });
            } else {
                await createJob({
                    registration: data.aspectOwner,
                    command: "RegisterTargetFingerprint",
                    parameters: [{
                        sha: data.sha,
                        targetfingerprint: `${data.type}::${data.name}`,
                        msgId,
                        broadcast: !!ci.parameters.raisePr,
                    }],
                }, ci.context);
            }
        },
    };
}
