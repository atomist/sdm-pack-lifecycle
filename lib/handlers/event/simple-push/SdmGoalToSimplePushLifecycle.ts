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
import { LifecyclePreferences } from "../preferences";
import { PushLifecycleHandler } from "../push/PushLifecycle";

/**
 * Send a Push lifecycle message on SdmGoal events.
 */
export function sdmGoalToSimplePushLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.SdmGoalToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "SdmGoalToSimplePushLifecycle",
        description: "Send a simple push lifecycle message on SdmGoal events",
        tags: ["lifecycle", "push", "sdm goal"],
        parameters: LifecycleParameters,
        subscription: subscription("sdmGoalToPushLifecycle"),
        listener: async (event, ctx, params) => {
            return lifecycle<graphql.SdmGoalToPushLifecycle.Subscription>(
                event,
                params,
                ctx,
                () => new PushLifecycleHandler(
                    e => [e.data.SdmGoal[0].push],
                    e => chatTeamsToPreferences(
                        _.get(e, "data.SdmGoal[0].push.repo.org.team.chatTeams")),
                    contributions,
                    LifecyclePreferences.simple_push.id,
                ),
            );
        },
    };
}
