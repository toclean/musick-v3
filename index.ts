// TODO(Connor) add ability to turn on flag that adds lyrics if it is not at the end of the video

import { Client, CommandInteraction, REST, Routes, SlashCommandBuilder, VoiceChannel } from 'discord.js';
import { search } from 'youtube-search-without-api-key';
import playdl from 'play-dl';
import { StringUtils } from 'turbocommons-ts/utils/StringUtils';
import { VoiceConnectionStatus, entersState, joinVoiceChannel, DiscordGatewayAdapterCreator, createAudioResource, NoSubscriberBehavior, createAudioPlayer, getVoiceConnection, VoiceConnection } from '@discordjs/voice';
import * as dotenv from 'dotenv' // see https://github.com/motdotla/dotenv#how-do-i-use-dotenv-with-import
dotenv.config()

let connection: VoiceConnection;

interface SearchResult {
  id: {
      videoId: any;
  };
  url: string;
  title: string;
  description: any;
  duration_raw: any;
  snippet: {
      url: string;
      duration: any;
      publishedAt: any;
      thumbnails: {
          id: any;
          url: any;
          default: any;
          high: any;
          height: any;
          width: any;
      };
      title: string;
      views: any;
  };
  views: any;
}

const APPLICATION_ID = process.env.APPLICATION_ID ?? '';
const TOKEN = process.env.TOKEN ?? '';
const DEBUG = true;

const commands = [
  {
    name: 'ping',
    description: 'Replies with Pong!',
  },
];

const playCommand  = new SlashCommandBuilder().setName('p').setDescription('Play a song').addStringOption(
    option => option.setName('query')
                    .setDescription('your song link/search')
                    .setRequired(true)
);

commands.push(playCommand);

const client = new Client({
    intents: [ 'GuildMessages', 'MessageContent', 'Guilds', 'GuildVoiceStates' ],
});

function setupCommands(guildId: string) {

    const rest = new REST({ version: '10' }).setToken(TOKEN);
    
    (async () => {
      try {
        console.log('Started refreshing application (/) commands.');
    
        await rest.put(Routes.applicationGuildCommands(APPLICATION_ID, guildId), { body: commands });
    
        console.log('Successfully reloaded application (/) commands.');
      } catch (error) {
        console.error(error);
      }
    })();
}

client.on('ready', () => { console.log('Ready...'); });

client.on('messageCreate', (msg) => {
    if (DEBUG) console.log(`[${msg.author.username}] ${msg.content === '' ? '*replied*' : msg.content}`);

    if (msg.author.bot) return;
    if (!msg.content.startsWith('.')) return;
    if (!msg.inGuild()) return;
    
    if (msg.content.substring(1) === 'deploy') {
        setupCommands(msg.guildId);
    }
});

// /**
//  * Makes sure that the user's query is actually somewhat in the title
//  * @param searchQuery
//  * @param searchResults 
//  * @returns 
//  */
// function vetSearch(searchQuery: string, searchResults: SearchResult[]) {
//   // Check search results for videos that don't include words in title
//   const searchWords = searchQuery.toLowerCase().split(' ');
//   const vettedResults = searchResults.filter((result) => {
//     const titleWords = result.title.toLowerCase().split(' ');
    
//     let found = false;
//     for (let searchword of searchWords) {
//       found = false;
//       for (let titleWord of titleWords) {
//         const wordSimPercentage = StringUtils.compareSimilarityPercent(titleWord, searchword);
//         if (wordSimPercentage > 50) {
//           found = true;
//           break;
//         }
//       }
//     };

//     return found;
//   });

//   return vettedResults;
// }

async function joinVoice(interaction: CommandInteraction) {
  try {
    const client = interaction.client;
    const guildId = interaction.guild?.id ?? '';
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const memberId = interaction.member?.user.id ?? '';
    const member = guild.members.cache.get(memberId);
    if (!member) return;
        
    const voiceChannel = member.voice.channel;
    if (voiceChannel as VoiceChannel) {
      connection = joinVoiceChannel({
        channelId: voiceChannel?.id ?? '',
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator as unknown as DiscordGatewayAdapterCreator,
      });

      connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
          ]);
          // Seems to be reconnecting to a new channel - ignore disconnect
        } catch (error) {
          // Seems to be a real disconnect which SHOULDN'T be recovered from
          connection.destroy();
        }
      });
    }
  } catch (e) {
    await interaction.editReply('Failed to join voice channel!');
  }
}

async function play(interaction: CommandInteraction) {
  if (!interaction.guildId || interaction.guildId === '') return await interaction.editReply('Not in a guild!');

    const option = interaction.options.get('query', true);
    const { name, value: searchQuery } = option;

    if (!searchQuery || typeof searchQuery !== 'string') return await interaction.editReply('Invalid search query!');

    if (DEBUG) console.log('SEARCH QUERY: ' + searchQuery);

    let searchResults = await search(searchQuery);
    if (searchResults && searchResults.length > 5) searchResults = searchResults.slice(0, 5);

    if (DEBUG) console.table(searchResults);

    // const vettedResults = vetSearch(searchQuery, searchResults);

    // if (DEBUG) console.table(vettedResults);

    const songInQuestion = searchResults[0]; // vettedResults[0];

    console.log('FOUND: ' + songInQuestion.title);

    await joinVoice(interaction);

    const stream = await playdl.stream(songInQuestion.url);

      let resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });

      let player = createAudioPlayer({
        behaviors: {
          noSubscriber: NoSubscriberBehavior.Play,
        }
      });

      try {
        player.play(resource);
        const vc = getVoiceConnection(interaction.guildId);

        if (!vc || vc.state.status === VoiceConnectionStatus.Destroyed || vc.state.status === VoiceConnectionStatus.Disconnected) {
          return await interaction.editReply('SOMETHING WENT REALLY BAD...');
        } 

        vc.subscribe(player);

        await interaction.editReply('Now Playing: ' + songInQuestion.title);
      } catch(e) {
        console.error(e);
      }
}

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const command = interaction as CommandInteraction;

    if (DEBUG) console.log(`[${interaction.user.username}] ${command.commandName} ${JSON.stringify(command.options.data.map((x) => x.name + '->' + x.value))}`);

    switch(command.commandName.toLocaleLowerCase()) {
        case 'ping':
            await interaction.reply('pong!');
            return;
        case 'p':
            await interaction.deferReply();
            play(interaction);
            return;
    }
});

client.login(TOKEN);