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

import { generateHash } from "@atomist/automation-client/lib/internal/util/string";
import { CommandHandlerRegistration } from "@atomist/sdm";

export function reviewComplianceCommand(): CommandHandlerRegistration<{ owner: string, repo: string, branch: string, sha: string }> {
    return {
        name: "ReviewCompliance",
        description: "Render compliance review messages in chat",
        parameters: {
            owner: {},
            repo: {},
            branch: {},
            sha: {},
        },
        listener: async ci => {
            await ci.context.messageClient.respond("test", { thread: true, id: generateHash(JSON.stringify(ci.parameters)) });
        },
    };
}
