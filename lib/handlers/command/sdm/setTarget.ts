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

import { guid } from "@atomist/automation-client/lib/internal/util/string";
import { createJob } from "@atomist/sdm/lib/api-helper/misc/job/createJob";
import { CommandHandlerRegistration } from "@atomist/sdm/lib/api/registration/CommandHandlerRegistration";

interface SetTargetParameters {
    data: string;
}

export function setTargetCommand(): CommandHandlerRegistration<SetTargetParameters> {
    return {
        name: "SetTarget",
        description: "Broadcast a set new target job",
        parameters: {
            data: {},
        },
        listener: async ci => {
            const msgId = guid();
            const data = JSON.parse(ci.parameters.data);

            await createJob({
                registration: data.aspectOwner,
                command: "RegisterTargetFingerprint",
                parameters: [{
                    sha: data.sha,
                    targetfingerprint: `${data.type}::${data.name}`,
                    msgId,
                    broadcast: true,
                }],
            }, ci.context);
        },
    };
}
