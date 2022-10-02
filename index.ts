import { CommandInteraction, GuildMember } from 'discord.js';
import { Bot as Discord } from './Bot';
import { Logger } from './Logger';
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
import { MusicManager } from './MusicManager';
dotenv.config()

const TOKEN = process.env.TOKEN ?? '';

const discord = new Discord({
    intents: ['GuildMessages', 'MessageContent', 'Guilds', 'GuildVoiceStates'],
});

async function start() {
    await discord.initialize();

    discord.on('ready', (c) => {
        console.info(`Joined as ${c.user.username}!`);
    });
    
    discord.on('messageCreate', (msg) => {
        Logger.debug(`[${msg.author.username}] -> ${msg.content ?? JSON.stringify(msg.embeds)}`);

        if (msg.author.bot) return;
        if (!msg.content.startsWith('.')) return;
        if (!msg.inGuild()) return; // For not ignoring DMs as the homies have no reason to DM the bot rn
    });

    discord.on('interactionCreate', async (interaction) => {
        if (!interaction.guildId) throw Error('Interaction was not sent from a guild!');
        // Make sure that this interaction is a command as we do not care if it is anything but a command
        if (!interaction.isCommand()) return;
        const command = interaction as CommandInteraction;

        if (!discord.musicManager) {
            const guild = discord.guilds.cache.get(interaction.guildId);
            if (!guild) throw Error('No guild with guildId: ' + interaction.guildId);
            discord.musicManager = new MusicManager();
            discord.musicManager.initialize(discord, interaction.guildId);
        }

        // Defer the interaction reply
        await command.deferReply();

        switch(command.commandName.toLowerCase()) {
            case 'p':
                const songTitle = await discord.musicManager?.addSong(command.options.get('query')?.value as string, command);
                await command.editReply('Queued: ' + songTitle);
                break;
            case 'skip':
                discord.musicManager.skip();
                await command.editReply('Skipped!');
                break;
            default:
                break;
        }
    });
    
    return discord.login(TOKEN);
}

start();