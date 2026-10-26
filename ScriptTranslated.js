import "frida-il2cpp-bridge";

Il2Cpp.perform(() => 
{
    const terrariaAssembly = Il2Cpp.domain.assembly("Assembly-CSharp");
    const ChatProcessorClass = terrariaAssembly.image.class("Terraria.Chat.ChatCommandProcessor");
    const MainClass = terrariaAssembly.image.class("Terraria.Main");
    const Player = terrariaAssembly.image.class("Terraria.Player");
    const NPC = terrariaAssembly.image.class("Terraria.NPC");
    const WorldGen = terrariaAssembly.image.class("Terraria.WorldGen");
    
    const sendMessage = MainClass.methods.find(m => m.name === "NewText" && m.parameterCount === 5);
    const NewNPC = NPC.method("NewNPC");
    const getMyPlayer = MainClass.method("get_myPlayer");
    const startSnowMoon = MainClass.method("startSnowMoon");
    const startPumpkinMoon = MainClass.method("startPumpkinMoon");
    const giveItem = Player.methods.find(m => m.name === "QuickSpawnItem" && m.parameterCount === 3);
    const AddBuff = Player.method("AddBuff");
    const Teleport = Player.method("UnityTeleport");
    const StartRain = MainClass.method("StartRain");
    const StopRain = MainClass.method("StopRain");
    const StartSlimeRain = MainClass.method("StartSlimeRain");
    const m = Process.findModuleByName("libil2cpp.so");
    const instruction = m.base.add(0x1329c6c);
    const original = 958349951;
    const nop = -721215457;
    const PickTile = Player.method("PickTile");
    let isMiningArea = false;
    let superPick = false;
    let globalRadius = null;
    
    const invasionList =
    {
        "goblinarmy": 1,
        "snowlegion": 2,
        "pirateinvasion": 3,
        "martianmadness": 4
    };

    // --- HELPER FUNCTIONS ---
    
    function getLocalPlayer() 
    {
        const players = MainClass.field("player").value;
        const index = getMyPlayer.invoke();
        return players.get(index);
    }

    function getPlayerByName(name) 
    {
        const players = MainClass.field("player").value;
        
        for (let i = 0; i < players.length; i++) 
        {
            const player = players.get(i);
            
            if (!player || player.isNull()) 
            {
                continue;
            }
            
            const isActive = player.field("active").value;
            if (!isActive) 
            {
                continue;
            }
            
            const playerNameObj = player.field("name").value;
            
            if (playerNameObj && !playerNameObj.isNull()) 
            {
                const playerName = playerNameObj.content;
                
                if (playerName === name) 
                {
                    return player;
                }
            }
        }
        return null;
    }
    
    function StartInvasion(type)
    {
        MainClass.field("invasionType").value = type;
        
        let playersCount = 0;
        const player = MainClass.field("player").value;
        
        for (let i = 0; i < 255; i++)
        {
            if (player.get(i).field("active").value === true)
            {
               playersCount++;
            }
        }
        if (playersCount === 0) playersCount = 1;
            
        MainClass.field("invasionSize").value = 80 + 40 * playersCount;
        if (type === 3) MainClass.field("invasionSize").value += 40 + 20 * playersCount;
        if (type === 4) MainClass.field("invasionSize").value = 160 + 40 * playersCount;
            
        MainClass.field("invasionSizeStart").value = MainClass.field("invasionSize").value;
        MainClass.field("invasionProgress").value = 0;
        MainClass.field("invasionProgressIcon").value = type + 3;
        MainClass.field("invasionProgressWave").value = 0;
        MainClass.field("invasionProgressMax").value = MainClass.field("invasionSizeStart").value;
        MainClass.field("invasionWarn").value = 0;
            
        if (type === 4)
        {
            MainClass.field("invasionWarn").value = 2;
        }
        else
        {
            MainClass.field("invasionX").value = 0; 
        }
    }

    // --- HOOKS ---

    ChatProcessorClass.method("CreateOutgoingMessage").implementation = function (textCsharp) 
    {
        const messageText = textCsharp.content;

        if (messageText && messageText.startsWith(".")) 
        {
            const netMode = MainClass.field("netMode").value;
            const player = getLocalPlayer();
            const msgToRet = this.method("CreateOutgoingMessage").invokeRaw(this.handle, textCsharp);
            
            if (msgToRet && !msgToRet.isNull()) 
            {
                msgToRet.field("<IsConsumed>k__BackingField").value = true;
            }

            const parts = messageText.trim().split(" ");
            const command = parts[0].toLowerCase();

            switch (command) 
            {
                case ".give":
                {
                    if (parts.length != 3)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[GIVE]: Syntax error. Usage: .give <id(number)> <count(number)>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const itemId = parseInt(parts[1]);
                    const count = parseInt(parts[2]);
                    
                    if (isNaN(itemId) || isNaN(count) || itemId > 6195 || itemId < 0)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[GIVE] Syntax error. Invalid ID or count.`), 255, 0, 0, false);
                        break;
                    }
                    
                    giveItem.invokeRaw(player.handle, ptr(0), itemId, count);
                    sendMessage.invoke(Il2Cpp.string(`[GIVE] Successfully gave item ${itemId} in amount ${count}x.`), 0, 255, 0, false);
                    break;
                }
                
                case ".ghost":
                {
                    if (parts.length != 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[GHOST] Error. Command does not support arguments.`), 255, 0, 0, false);
                        break;
                    }
                    
                    let ghost = player.field("ghost").value;
                    
                    if (!ghost)
                    {
                        player.field("ghost").value = 1;
                        sendMessage.invoke(Il2Cpp.string(`[GHOST] Ghost mode: ON.`), 0, 255, 0, false);
                        break;
                    }
                    else
                    {
                        player.field("ghost").value = 0;
                        sendMessage.invoke(Il2Cpp.string(`[GHOST] Ghost mode: OFF.`), 0, 255, 0, false);
                        break;
                    }
                }
                
                case ".godmode":
                {
                    let godmodebool = player.field("creativeGodMode").value;
                    
                    if (parts.length != 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[GODMODE] Error. Command does not support arguments.`), 255, 0, 0, false);
                        break;
                    }
                    
                    if (!godmodebool)
                    {
                        Memory.protect(instruction, 4, 'rwx');
                        instruction.writeInt(nop);
                        player.field("creativeGodMode").value = true;
                        sendMessage.invoke(Il2Cpp.string(`[GODMODE] God mode: ON.`), 0, 255, 0, false);
                        break;
                    }
                    else
                    {
                        Memory.protect(instruction, 4, 'rwx');
                        instruction.writeInt(original);
                        sendMessage.invoke(Il2Cpp.string(`[GODMODE] God mode: OFF.`), 0, 255, 0, false);
                        break;
                    }
                }
                
                case ".effect":
                {
                    if (parts.length != 3)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[EFFECT]: Syntax error. Usage: .effect <id(number)> <time(number)>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const buffId = parseInt(parts[1]);
                    const time = parseInt(parts[2]);
                    
                    if (isNaN(buffId) || isNaN(time) || buffId > 400 || time < 0 || time > 50000)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[EFFECT] Syntax error. Invalid ID or time.`), 255, 0, 0, false);
                        break;
                    }
                    
                    AddBuff.invokeRaw(player.handle, buffId, time, false);
                    sendMessage.invoke(Il2Cpp.string(`[EFFECT] Successfully gave buff ID ${buffId} for ${time}.`), 0, 255, 0, false);
                    break;
                }
                
                case ".hp":
                {
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[HP]: Syntax error. Usage: .hp <count(number)>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const count = parseInt(parts[1]);
                    
                    if (isNaN(count) || count > 100000 || count < 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[HP] Syntax error. Count must be a number from 1 to 100000.`), 255, 0, 0, false);
                        break;
                    }
                    
                    player.field("statLifeMax").value = count;
                    sendMessage.invoke(Il2Cpp.string(`[HP] Health successfully set to ${count}.`), 0, 255, 0, false);
                    break;
                }
                
                case ".mana":
                {
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[MANA]: Syntax error. Usage: .mana <count(number)>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const count = parseInt(parts[1]);
                    
                    if (isNaN(count) || count > 1000 || count < 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[MANA] Syntax error. Count must be a number from 1 to 1000.`), 255, 0, 0, false);
                        break;
                    }
                    
                    player.field("statManaMax").value = count;
                    sendMessage.invoke(Il2Cpp.string(`[MANA] Mana successfully set to ${count}.`), 0, 255, 0, false);
                    break;
                }
                
                case ".superpick":
                {
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[SUPERPICK]: Syntax error. Usage: .superpick <radius(number)>.`), 255, 0, 0, false);
                        break;
                    }
    
                    const parsedRadius = parseInt(parts[1]);
    
                    if (isNaN(parsedRadius) || parsedRadius > 3 || parsedRadius < 0)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[SUPERPICK] Syntax error. Radius must be a number from 0 to 3.`), 255, 0, 0, false);
                        break;
                    }
    
                    globalRadius = parsedRadius;
                    let diameter = globalRadius * 2 + 1;
    
                    if (globalRadius === 0)
                    {
                        superPick = false;
                        sendMessage.invoke(Il2Cpp.string(`[SUPERPICK] Super pickaxe: OFF.`), 0, 255, 0, false);
                    }
                    
                    else if (!superPick)
                    {
                        superPick = true;
                        sendMessage.invoke(Il2Cpp.string(`[SUPERPICK] Super pickaxe: ON. Mining radius: ${diameter}x${diameter}. To disable, type .superpick 0.`), 0, 255, 0, false);
                    }
                  
                    else
                    {
                        sendMessage.invoke(Il2Cpp.string(`[SUPERPICK] Mining radius successfully changed to ${diameter}x${diameter}.`), 0, 255, 0, false);
                    }
    
                    break;
                }

                case ".tp":
                {
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[TP]: Syntax error. Usage: .tp <targetName(string)>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const targetPlayer = getPlayerByName(parts[1]);
                    
                    if (!targetPlayer)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[TP] Player not found.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const vector2 = targetPlayer.field("position").value;
                    const x = vector2.field("X").value;
                    const y = vector2.field("Y").value;
                    
                    Teleport.invokeRaw(player.handle, [x, y]);
                    sendMessage.invoke(Il2Cpp.string(`[TP] Successfully teleported to player ${parts[1]}.`), 0, 255, 0, false);
                    break;
                }
                
                case ".summon":
                {
                    if (netMode === 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[SUMMON] This command is only available in single player.`), 255, 0, 0, false);
                        break;
                    }
                    if (parts.length != 3)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[SUMMON]: Syntax error. Usage: .summon <id/number> <count/number>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const NPCId = parseInt(parts[1]);
                    const count = parseInt(parts[2]);
                    
                    if (isNaN(NPCId) || isNaN(count) || NPCId > 696|| NPCId < -65 || count < 0 || count > 50)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[SUMMON] Syntax error. Invalid ID or count.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const vector2 = player.field("position").value;
                    let x = Math.round(vector2.field("X").value);
                    const y = Math.round(vector2.field("Y").value);
                    
                    for (let i = 0; i < count; i++)
                    {
                        x += 10;
                        NewNPC.invoke(ptr(0), x, y, NPCId, 0, 0, 0, 0, 0, 255);
                    }
                    sendMessage.invoke(Il2Cpp.string(`[SUMMON] Successfully spawned NPC ${NPCId} in amount ${count}x.`), 0, 255, 0, false);
                    break;
                }
                
                case ".clearinv":
                {
                    if (parts.length != 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[CLEARINV] Error. Command does not support arguments.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const inventory = player.field("inventory").value;
                    
                    for (let i = 0; i < 50; i++)
                    {
                        const item = inventory.get(i);
                        if (!item) continue;
                        item.method("TurnToAir").invokeRaw(item.handle);
                    }
                    
                    sendMessage.invoke(Il2Cpp.string(`[CLEARINV] Inventory successfully cleared.`), 0, 255, 0, false);
                    break;
                }
                
                case ".time":
                {
                    if (netMode === 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[TIME] This command is only available in single player.`), 255, 0, 0, false);
                        break;
                    }
                    
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[TIME]: Syntax error. Usage: .time <day/night>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const time = parts[1];
                    
                    switch (time)
                    {
                        case "day":
                        {
                            MainClass.field("dayTime").value = true;
                            MainClass.field("time").value = 27000;
                            sendMessage.invoke(Il2Cpp.string(`[TIME] Time successfully set to day.`), 0, 255, 0, false);
                            break;
                        }
                        
                        case "night":
                        {
                            MainClass.field("dayTime").value = false;
                            MainClass.field("time").value = 16200;
                            sendMessage.invoke(Il2Cpp.string(`[TIME] Time successfully set to night.`), 0, 255, 0, false);
                            break;
                        }
                        
                        default:
                        {
                           sendMessage.invoke(Il2Cpp.string(`[TIME] Syntax error. Usage: .time <day/night>.`), 255, 0, 0, false);
                           break;
                        }
                    }
                    break;
                }
                
                case ".difficulty":
                {
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[DIFFICULTY]: Syntax error. Usage: .difficulty <softcore/expert/master/journey>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const difficulty = parts[1];
                    
                    switch (difficulty)
                    {
                        case "softcore":
                        {
                            player.field("difficulty").value = 0;
                            sendMessage.invoke(Il2Cpp.string(`[DIFFICULTY] Successfully changed character difficulty to softcore.`), 0, 255, 0, false);
                            break;
                        }
                        
                        case "expert":
                        {
                            player.field("difficulty").value = 1;
                            sendMessage.invoke(Il2Cpp.string(`[DIFFICULTY] Successfully changed character difficulty to expert.`), 0, 255, 0, false);
                            break;
                        }
                        
                        case "master":
                        {
                            player.field("difficulty").value = 2;
                            sendMessage.invoke(Il2Cpp.string(`[DIFFICULTY] Successfully changed character difficulty to master.`), 0, 255, 0, false);
                            break;
                        }
                        
                        case "journey":
                        {
                            player.field("difficulty").value = 3;
                            sendMessage.invoke(Il2Cpp.string(`[DIFFICULTY] Successfully changed character difficulty to journey.`), 0, 255, 0, false);
                            break;
                        }
                        
                        default:
                        {
                            sendMessage.invoke(Il2Cpp.string(`[DIFFICULTY] Syntax error. Usage: .difficulty <softcore/expert/master/journey>.`), 255, 0, 0, false);
                            break;
                        }
                    }
                    break;
                }
                
                case ".hardmode":
                {
                    if (netMode === 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[HARDMODE] This command is only available in single player.`), 255, 0, 0, false);
                        break;
                    }
                    
                    if (parts.length != 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[HARDMODE] Error. Command does not support arguments.`), 255, 0, 0, false);
                        break;
                    }
                    
                    WorldGen.method("StartHardmode").invoke();
                    sendMessage.invoke(Il2Cpp.string(`[HARDMODE] Hardmode transition process started.`), 0, 255, 0, false);
                    break;
                }
                
                case ".invasion":
                {
                    if (netMode === 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[INVASION] This command is only available in single player.`), 255, 0, 0, false);
                        break;
                    }
                    
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[INVASION]: Syntax error. Usage: .invasion <event(string)>. Type .events for a list of events.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const invasionId = parts[1];
                    let success = false;
                    
                    if (invasionList[invasionId])
                    {
                        StartInvasion(invasionList[invasionId]);
                        success = true;
                    }
                    
                    switch (invasionId)
                    {
                        case "snowmoon":
                        {
                            MainClass.field("dayTime").value = false;
                            MainClass.field("time").value = 0;
                            startSnowMoon.invoke();
                            success = true;
                            break;
                        }
                        
                        case "pumpkinmoon":
                        {
                            MainClass.field("dayTime").value = false;
                            MainClass.field("time").value = 0;
                            startPumpkinMoon.invoke();
                            success = true;
                            break;
                        }
                        case "slimerain":
                        {
                            StartSlimeRain.invoke(true);
                            success = true;
                            break;
                        }
                    }
                    
                    if (success)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[INVASION] Event successfully triggered.`), 0, 255, 0, false);
                        break;
                    }
                    else
                    {
                        sendMessage.invoke(Il2Cpp.string(`[INVASION] Error. Event named ${invasionId} does not exist. Type .events for a list of events.`), 255, 0, 0, false);
                        break;
                    }
                }
                
                case ".weather":
                {
                    if (netMode === 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[WEATHER] This command is only available in single player.`), 255, 0, 0, false);
                        break;
                    }
                    
                    if (parts.length != 2)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[WEATHER]: Syntax error. Usage: .weather <rain/clear>.`), 255, 0, 0, false);
                        break;
                    }
                    
                    const weather = parts[1];
                    
                    switch (weather)
                    {
                        case "rain":
                        {
                            StartRain.invoke(true, [1, 1], false);
                            sendMessage.invoke(Il2Cpp.string(`[WEATHER] Weather successfully set to rain.`), 0, 255, 0, false);
                            break;
                        }
                        
                        case "clear":
                        {
                            StopRain.invoke(true);
                            sendMessage.invoke(Il2Cpp.string(`[WEATHER] Weather successfully set to clear.`), 0, 255, 0, false);
                            break;
                        }
                        
                        default:
                        {
                            sendMessage.invoke(Il2Cpp.string(`[WEATHER]: Syntax error. Usage: .weather <rain/clear>.`), 255, 0, 0, false);
                            break;
                        }
                    }
                    break;
                }
                
                case ".events":
                {
                    if (parts.length != 1)
                    {
                        sendMessage.invoke(Il2Cpp.string(`[EVENTS]: Error. Command does not support arguments.`), 255, 0, 0, false);
                        break;
                    }
                    
                    sendMessage.invoke(Il2Cpp.string(`[EVENTS] List of available events:`), 255, 255, 0, false);
                    sendMessage.invoke(Il2Cpp.string(`goblinarmy, snowlegion, pirateinvasion, martianmadness, snowmoon, pumpkinmoon, slimerain`), 255, 255, 0, false);
                    break;
                }
                                
                case ".help":
                {
                    sendMessage.invoke(Il2Cpp.string(`[HELP] List of available commands:`), 255, 255, 0, false);
                    sendMessage.invoke(Il2Cpp.string(`.godmode, .ghost, .give, .hp, .effect, .mana, .tp, .superpick, .summon, .time, .clearinv, .difficulty, .invasion, .hardmode, .events`), 255, 255, 0, false);
                    break;
                }

                default:
                {
                    sendMessage.invoke(Il2Cpp.string(`[ERROR] Unknown command <${command}>. Type .help for a list of commands.`), 255, 0, 0, false);
                    break;
                }
            }
            return msgToRet;
        }
        return this.method("CreateOutgoingMessage").invokeRaw(this.handle, textCsharp);
    };
    
    ChatProcessorClass.method("ProcessIncomingMessage").implementation = function (msgObj, clientId)
    {
        const messageText = msgObj.method("get_Text").invokeRaw(msgObj.handle);
        const finalText = messageText.content;
        
        if (finalText.startsWith(".") && clientId === 0)
        {
            return;
        }
        this.method("ProcessIncomingMessage").invoke(msgObj, clientId);
    };
    
    PickTile.implementation = function (x, y, pickPower)
    {
        if (!superPick)
        {
            this.method("PickTile").invokeRaw(this.handle, x, y, pickPower, -1);
            return;
        }
        
        if (!isMiningArea)
        {
            isMiningArea = true;

            let radius = globalRadius;
            const customPower = 999;

            for (let dx = -radius; dx <= radius; dx++)
            {
                for (let dy = -radius; dy <= radius; dy++)
                {
                    this.method("PickTile").invokeRaw(this.handle, x + dx, y + dy, customPower, -1);
                }
            }

            isMiningArea = false;
        }
    };
});