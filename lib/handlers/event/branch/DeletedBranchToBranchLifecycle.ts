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
import { BranchLifecycle } from "./BranchLifecycle";

/**
 * Send a lifecycle message on DeletedBranch events.
 */
export function deletedBranchToBranchLifecycle(contributions: Contributions)
    : EventHandlerRegistration<graphql.DeletedBranchToBranchLifecycle.Subscription, LifecycleParametersDefinition> {
    return {
        name: "DeletedBranchToBranchLifecycle",
        description: "Send a branch lifecycle message on DeletedBranch events",
        tags: ["lifecycle", "branch", "deleted branch"],
        parameters: LifecycleParameters,
        subscription: subscription("deletedBranchToBranchLifecycle"),
        listener: async (e, ctx, params) => {
            return lifecycle<graphql.DeletedBranchToBranchLifecycle.Subscription>(
                e,
                params,
                e.data?.DeletedBranch[0]?.repo,
                ctx,
                () => new BranchLifecycle(
                    ev => {
                        const branch = _.get(ev, "data.DeletedBranch[0]");
                        return [[branch], branch.repo, true];
                    },
                    ev => chatTeamsToPreferences(
                        _.get(ev, "data.DeletedBranch[0].repo.org.team.chatTeams")),
                    contributions,
                ),
            );
        },
    };
}
