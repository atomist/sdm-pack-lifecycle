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

import { HandlerContext } from "@atomist/automation-client/lib/HandlerContext";
import { QueryNoCacheOptions } from "@atomist/automation-client/lib/spi/graph/GraphClient";
import { addressEvent } from "@atomist/automation-client/lib/spi/message/MessageClient";
import { CommandHandlerRegistration } from "@atomist/sdm/lib/api/registration/CommandHandlerRegistration";
import * as _ from "lodash";
import {
    ComplianceOnPush,
    PolicyCompliaceState,
} from "../../../typings/types";

export function openComplianceReview(): CommandHandlerRegistration<{ id: string }> {
    return {
        name: "OpenComplianceReview",
        description: "Render compliance review messages in chat",
        parameters: {
            id: {},
        },
        listener: async ci => {
            await toggleComplianceReviewByPush(ci.parameters.id, true, ci.context);
        },
    };
}

export function discardComplianceReview(): CommandHandlerRegistration<{ id: string }> {
    return {
        name: "DiscardComplianceReview",
        description: "Discard compliance review messages in chat",
        parameters: {
            id: {},
        },
        listener: async ci => {
            await toggleComplianceReviewByPush(ci.parameters.id, false, ci.context);
        },
    };
}

export async function toggleComplianceReviewByPush(id: string, enable: boolean, ctx: HandlerContext): Promise<void> {
    const push = await ctx.graphClient.query<ComplianceOnPush.Query, ComplianceOnPush.Variables>({
        name: "ComplianceOnPush",
        variables: {
            id,
        },
        options: QueryNoCacheOptions,
    });

    const complianceData = _.get(push, "Push[0].compliance");
    if (!!complianceData) {
        for (const compliance of complianceData) {
            await ctx.messageClient.send(
                {
                    ...compliance,
                    state: enable ? PolicyCompliaceState.in_review : PolicyCompliaceState.reviewed,
                },
                addressEvent("PolicyCompliance"));
        }
    }
}
