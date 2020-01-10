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

import { MappedParameters } from "@atomist/automation-client/lib/decorators";
import {
    slackInfoMessage,
    slackSuccessMessage,
} from "@atomist/sdm/lib/api-helper/misc/slack/messages";
import { SoftwareDeliveryMachine } from "@atomist/sdm/lib/api/machine/SoftwareDeliveryMachine";
import { CommandHandlerRegistration } from "@atomist/sdm/lib/api/registration/CommandHandlerRegistration";
import { DeclarationType } from "@atomist/sdm/lib/api/registration/ParametersDefinition";
import {
    bold,
    channel,
} from "@atomist/slack-messages";
import * as _ from "lodash";
import { Channel } from "../../../lifecycle/Lifecycle";

/**
 * Command to subscribe or unsubscribe from goal sets
 */
export function toggleGoalSetsSubscription(sdm: SoftwareDeliveryMachine,
                                           subscribe: boolean)
    : CommandHandlerRegistration<{ login: string, scmLogin: string, channelName: string, channelId: string, chatTeamId: string }> {
    return {
        name: subscribe ? "SubscribeToGoalSets" : "UnscribeFromGoalSets",
        tags: [],
        intent: subscribe ? ["subscribe to goal sets"] : ["unsubscribe from goal sets"],
        description: `${subscribe ? "Subscribe to" : "Unsubscribe from"} goal sets`,
        autoSubmit: true,
        parameters: {
            login: { description: `SCM login of the user you want to ${subscribe ? "subscribe to" : "unsubscribe from"}`, required: false },
            scmLogin: { uri: MappedParameters.GitHubUserLogin, declarationType: DeclarationType.Mapped },
            channelName: { uri: MappedParameters.SlackChannelName, declarationType: DeclarationType.Mapped },
            channelId: { uri: MappedParameters.SlackChannel, declarationType: DeclarationType.Mapped },
            chatTeamId: { uri: MappedParameters.SlackTeam, declarationType: DeclarationType.Mapped },
        },
        listener: async ci => {
            const login = ci.parameters.login || ci.parameters.scmLogin;
            if (subscribe) {
                const subscriptions = await ci.preferences.get<Channel[]>(subscribePreferenceKey(login), { defaultValue: [] });
                await ci.preferences.put<Channel[]>(
                    subscribePreferenceKey(login),
                    _.uniqBy([...subscriptions, {
                        name: ci.parameters.channelName,
                        teamId: ci.parameters.chatTeamId,
                    }], e => `${e.teamId}#${e.name}`));
                await ci.context.messageClient.respond(
                    slackSuccessMessage(
                        "Goal Set Subscription",
                        `Successfully subscribed to goal sets of ${bold(login)} in ${channel(ci.parameters.channelId, ci.parameters.channelName)}`));
            } else {
                const subscriptions = await ci.preferences.get<Channel[]>(subscribePreferenceKey(login), { defaultValue: [] });
                await ci.preferences.put<Channel[]>(
                    subscribePreferenceKey(login),
                    subscriptions.filter(s => s.name !== ci.parameters.channelName && s.teamId === ci.parameters.chatTeamId));
                await ci.context.messageClient.respond(
                    slackInfoMessage(
                        "Goal Set Subscription",
                        `Successfully unsubscribed from goal sets of ${bold(login)} in ${channel(ci.parameters.channelId, ci.parameters.channelName)}`));
            }
        },
    };
}

export function subscribePreferenceKey(login: string): string {
    return `@atomist/lifecycle.subscribed_to_goal_sets.${login}`;
}
