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

import { GraphQL } from "@atomist/automation-client";
import { EventHandlerRegistration } from "@atomist/sdm";
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
 * Send a lifecycle message on Push events.
 */
export function pushToSimplePushLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.PushToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "PushToSimplePushLifecycle",
        description: "Send a simple push lifecycle message on Push events",
        tags: ["lifecycle", "push"],
        parameters: LifecycleParameters,
        subscription: GraphQL.subscription("pushToPushLifecycle"),
        listener: async (event, ctx, params) => {
            return lifecycle<graphql.PushToPushLifecycle.Subscription>(
                event,
                params,
                ctx,
                () => new PushLifecycleHandler(
                    e => e.data.Push,
                    e => chatTeamsToPreferences(
                        _.get(e, "data.Push[0].repo.org.team.chatTeams")),
                    contributions,
                    LifecyclePreferences.simple_push.id,
                ),
            );
        },
    };
}
