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

import { AutomationContextAware } from "@atomist/automation-client/lib/HandlerContext";
import { CommandIncoming } from "@atomist/automation-client/lib/internal/transport/RequestProcessor";
import { CommandHandlerRegistration } from "@atomist/sdm/lib/api/registration/CommandHandlerRegistration";
import {
    AtmInitialJobState,
    CreateActionJob,
    ResumeActionJob,
} from "../../../typings/types";

export function routeAttachmentAction(): CommandHandlerRegistration<{ _atmCommand: string, _atmConfiguration: string, _atmSkill: string }> {
    return {
        name: "routeAttachmentAction",
        description: "Route the lifecycle attachment action",
        parameters: {
            _atmCommand: {},
            _atmConfiguration: {},
            _atmSkill: {},
        },
        listener: async ci => {
            const trigger = (ci.context as any as AutomationContextAware).trigger as CommandIncoming;
            trigger.command = ci.parameters._atmCommand;
            trigger.parameters = trigger.parameters.filter(p => !p.name.startsWith("_atm"));
            delete (trigger as any).skill;
            delete trigger.secrets;
            delete (trigger as any).handler;
            delete (trigger as any).configurations;

            const id = (await ci.context.graphClient.mutate<CreateActionJob.Mutation, CreateActionJob.Variables>(
                {
                    name: "createActionJob",
                    variables: {
                        job: {
                            owner: ci.parameters._atmSkill,
                            name: `${ci.parameters._atmSkill}/${ci.parameters._atmCommand}/${ci.parameters._atmConfiguration}`,
                            initialState: AtmInitialJobState.preparing,
                            maxRunningTasks: 1,
                            jobTasks: [{
                                data: JSON.stringify({
                                    configuration: ci.parameters._atmConfiguration,
                                    skill: ci.parameters._atmSkill,
                                    command: ci.parameters._atmCommand,
                                    payload: trigger,
                                }),
                                name: ci.parameters._atmCommand,
                            }],
                        },
                    },
                })).createAtmJob.id;

            await ci.context.graphClient.mutate<ResumeActionJob.Mutation, ResumeActionJob.Variables>({
                name: "resumeActionJob",
                variables: {
                    id,
                },
            });
        },
    };
}
