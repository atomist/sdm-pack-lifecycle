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
import { EventHandlerRegistration } from "@atomist/sdm/lib/api/registration/EventHandlerRegistration";
import * as _ from "lodash";
import {
    lifecycle,
    LifecycleParameters,
    LifecycleParametersDefinition,
} from "../../../lifecycle/Lifecycle";
import { chatTeamsToPreferences } from "../../../lifecycle/util";
import { Contributions } from "../../../lifecycleSupport";
import * as graphql from "../../../typings/types";
import {
    PushLifecycleHandler,
} from "./PushLifecycle";

/**
 * Send a Push lifecycle message on Status events.
 */
export function lifecycleAttachmentToPushLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.LifecycleAttachmentToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "LifecycleAttachmentToPushLifecycle",
        description: "Send a push lifecycle message on LifecycleAttachment events",
        tags: ["lifecycle", "push", "lifecycleAttachment"],
        parameters: LifecycleParameters,
        subscription: subscription("lifecycleAttachmentToPushLifecycle"),
        listener: async (e, ctx, params) => {
            // query for Push based on LifecycleAttachment
            const data: { sha: string, branch: string } = JSON.parse(e.data.LifecycleAttachment[0].identifier);
            const push = await ctx.graphClient.query<graphql.PushByShaAndBranchQuery, graphql.PushByShaAndBranchQueryVariables>({name: "pushByShaAndBranch", variables: data});

            return lifecycle<graphql.PushToPushLifecycle.Subscription>(
                {
                    ...e,
                    data: { Push: push.Commit?.[0]?.pushes },
                },
                params,
                push.Commit?.[0]?.pushes[0]?.repo,
                ctx,
                () => new PushLifecycleHandler(
                    ev => ev.data.Push,
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Push[0].repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}
