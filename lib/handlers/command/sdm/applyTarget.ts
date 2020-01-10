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

interface ApplyTargetParameters {
    owner: string;
    repo: string;
    branch: string;
    apiUrl: string;

    data: string;
}

export function applyTargetCommand(): CommandHandlerRegistration<ApplyTargetParameters> {
    return {
        name: "ApplyTarget",
        description: "Broadcast a try target job",
        parameters: {
            owner: {},
            repo: {},
            branch: {},
            apiUrl: {},

            data: {},
        },
        listener: async ci => {
            const data = JSON.parse(ci.parameters.data);

            await createJob({
                registration: data.aspectOwner,
                command: "ApplyTargetFingerprintBySha",
                parameters: [{
                    sha: data.sha,
                    targetfingerprint: `${data.type}::${data.name}`,
                    targets: {
                        owner: ci.parameters.owner,
                        repo: ci.parameters.repo,
                        branch: ci.parameters.branch,
                        apiUrl: ci.parameters.apiUrl,
                    },
                    msgId: guid(),
                    // "job.name": ci.parameters.title,
                    // "job.description": ci.parameters.description,
                }],
            }, ci.context);
        },
    };
}
