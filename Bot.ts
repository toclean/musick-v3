import { Client, ClientOptions, GuildManager, REST, Routes, SlashCommandBuilder } from "discord.js";
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { MusicManager } from "./MusicManager";
dotenv.config()

const APPLICATION_ID = process.env.APPLICATION_ID ?? '';
const TOKEN = process.env.TOKEN ?? '';
const DEBUG = process.env.DEBUG ?? true;

export class Bot extends Client {
    musicManager: MusicManager | undefined;

    constructor(options: ClientOptions) {
        super(options);
    }

    async initialize() {
        const commands = [];
        
        const playCommand = new SlashCommandBuilder().setName('play').setDescription('Play a song').addStringOption(
            option => option.setName('query')
                .setDescription('your song link/search')
                .setRequired(true)
        );
        const skipCommand = new SlashCommandBuilder().setName('skip').setDescription('Skips a song');
        const volumeCommand = new SlashCommandBuilder().setName('v').setDescription('Changes the bot volume for everyone!');
        const pauseComamnd = new SlashCommandBuilder().setName('resume').setDescription('Pauses the current song');
        const resumeCommand = new SlashCommandBuilder().setName('pause').setDescription('Resumes the current song');
        
        commands.push(...[
            playCommand,
            skipCommand,
            volumeCommand,
            pauseComamnd,
            resumeCommand,
        ]);
        
        const rest = new REST({ version: '10' }).setToken(TOKEN);

        await (async () => {
            try {
                console.log('Started refreshing application (/) commands.');

                await rest.put(Routes.applicationCommands(APPLICATION_ID), { body: commands });

                console.log('Successfully reloaded application (/) commands.');
            } catch (error) {
                console.error(error);
            }
        })();
    }
}