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
    PushCardLifecycleHandler,
    PushLifecycleHandler,
} from "./PushLifecycle";

/**
 * Send a Push lifecycle message on Status events.
 */
export function statusToPushLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.StatusToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "StatusToPushLifecycle",
        description: "Send a push lifecycle message on Status events",
        tags: ["lifecycle", "push", "status"],
        parameters: LifecycleParameters,
        subscription: subscription("statusToPushLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.StatusToPushLifecycle.Subscription>(
                e,
                params,
                e.data.Status[0]?.commit?.pushes[0]?.repo,
                ctx,
                () => new PushLifecycleHandler(
                    ev => ev.data.Status[0].commit.pushes,
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.Status[0].commit.pushes[0].repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}

/**
 * Send a Push lifecycle card on Status events.
 */
export function statusToPushCardLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.StatusToPushLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "StatusToPushCardLifecycle",
        description: "Send a push lifecycle card on Status events",
        tags: ["lifecycle", "push", "status"],
        parameters: LifecycleParameters,
        subscription: subscription("statusToPushLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.StatusToPushLifecycle.Subscription>(
                e,
                params,
                e.data.Status[0]?.commit?.pushes[0]?.repo,
                ctx,
                () => new PushCardLifecycleHandler(
                    ev => {// filter CI statuses as we don't want them to overwrite
                        const cis = ["travis", "jenkins", "circle", "codeship"];
                        const status = ev.data.Status[0];
                        if (!cis.some(ci => status.context.includes(ci))) {
                            return ev.data.Status[0].commit.pushes;
                        } else {
                            return [];
                        }
                    },
                    contributions,
                ),
            );
        },
    };
}
