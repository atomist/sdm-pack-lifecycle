import { MappedParameters } from "@atomist/automation-client";
import {
    CommandHandlerRegistration,
    DeclarationType,
    slackInfoMessage,
    slackSuccessMessage,
    SoftwareDeliveryMachine,
} from "@atomist/sdm";
import { channel } from "@atomist/slack-messages";
import * as _ from "lodash";
import { Channel } from "../../../lifecycle/Lifecycle";

export function toggleOwnGoalSetsSubscription(sdm: SoftwareDeliveryMachine,
                                              subscribe: boolean)
    : CommandHandlerRegistration<{ login: string, channelName: string, channelId: string, chatTeamId: string }> {
    return {
        name: subscribe ? "SubscribeToOwnGoalSets" : "UnscribeFromOwnGoalSets",
        tags: [],
        intent: subscribe ? ["subscribe to own goal sets"] : ["unsubscribe from own goal sets"],
        description: `${subscribe ? "Subscribe to" : "Unsubscribe from"} own goal sets`,
        parameters: {
            login: { uri: MappedParameters.GitHubUserLogin, declarationType: DeclarationType.Mapped },
            channelName: { uri: MappedParameters.SlackChannelName, declarationType: DeclarationType.Mapped },
            channelId: { uri: MappedParameters.SlackChannel, declarationType: DeclarationType.Mapped },
            chatTeamId: { uri: MappedParameters.SlackTeam, declarationType: DeclarationType.Mapped },
        },
        listener: async ci => {
            if (subscribe) {
                const subscriptions = await ci.preferences.get<Channel[]>(subscribePreferenceKey(ci.parameters.login), { defaultValue: [] });
                await ci.preferences.put<Channel[]>(
                    subscribePreferenceKey(ci.parameters.login),
                    _.uniqBy([...subscriptions, {
                        name: ci.parameters.channelName,
                        teamId: ci.parameters.chatTeamId,
                    }], e => `${e.teamId}#${e.name}`));
                await ci.context.messageClient.respond(
                    slackSuccessMessage(
                        "Goal Set Subscription",
                        `Successfully subscribed to own goal sets in ${channel(ci.parameters.channelId, ci.parameters.channelName)}`));
            } else {
                const subscriptions = await ci.preferences.get<Channel[]>(subscribePreferenceKey(ci.parameters.login), { defaultValue: [] });
                await ci.preferences.put<Channel[]>(
                    subscribePreferenceKey(ci.parameters.login),
                    subscriptions.filter(s => s.name !== ci.parameters.channelName && s.teamId === ci.parameters.chatTeamId));
                await ci.context.messageClient.respond(
                    slackInfoMessage(
                        "Goal Set Subscription",
                        `Successfully unsubscribed from own goal sets in ${channel(ci.parameters.channelId, ci.parameters.channelName)}`));
            }
        },
    };
}

export function subscribePreferenceKey(login: string): string {
    return `@atomist/lifecycle.subscribed_to_own_goal_sets.${login}`;
}
