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
    addressEvent,
    QueryNoCacheOptions,
} from "@atomist/automation-client";
import { CommandHandlerRegistration } from "@atomist/sdm";
import * as _ from "lodash";
import {
    ComplianceOnPush,
    PolicyCompliaceState,
} from "../../../typings/types";

export function openComplianceReview(): CommandHandlerRegistration<{ owner: string, repo: string, branch: string, sha: string }> {
    return {
        name: "OpenComplianceReview",
        description: "Render compliance review messages in chat",
        parameters: {
            owner: {},
            repo: {},
            branch: {},
            sha: {},
        },
        listener: async ci => {

            const push = await ci.context.graphClient.query<ComplianceOnPush.Query, ComplianceOnPush.Variables>({
                name: "ComplianceOnPush",
                variables: {
                    branch: ci.parameters.branch,
                    sha: ci.parameters.sha,
                },
                options: QueryNoCacheOptions,
            });

            const complianceData = _.get(push, "Push[0].compliance");
            if (!!complianceData) {
                for (const compliance of complianceData) {
                    await ci.context.messageClient.send(
                        {
                            ...compliance,
                            state: PolicyCompliaceState.in_review,
                        },
                        addressEvent("PolicyCompliance"));
                }
            }
        },
    };
}

export function discardComplianceReview(): CommandHandlerRegistration<{ owner: string, repo: string, branch: string, sha: string }> {
    return {
        name: "DiscardComplianceReview",
        description: "Render compliance review messages in chat",
        parameters: {
            owner: {},
            repo: {},
            branch: {},
            sha: {},
        },
        listener: async ci => {

            const push = await ci.context.graphClient.query<ComplianceOnPush.Query, ComplianceOnPush.Variables>({
                name: "ComplianceOnPush",
                variables: {
                    branch: ci.parameters.branch,
                    sha: ci.parameters.sha,
                },
                options: QueryNoCacheOptions,
            });

            const complianceData = _.get(push, "Push[0].compliance");
            if (!!complianceData) {
                for (const compliance of complianceData) {
                    await ci.context.messageClient.send(
                        {
                            ...compliance,
                            state: PolicyCompliaceState.reviewed,
                        },
                        addressEvent("PolicyCompliance"));
                }
            }
        },
    };
}
