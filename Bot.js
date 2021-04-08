const mineflayer = require('mineflayer')
const pvp = require('mineflayer-pvp').plugin
const { pathfinder, Movements, goals} = require('mineflayer-pathfinder')
var blockFinderPlugin = require('mineflayer-blockfinder')(mineflayer);
const armorManager = require('mineflayer-armor-manager')
const collectBlock = require('mineflayer-collectblock').plugin
const mineflayerViewer = require('prismarine-viewer').mineflayer
const Vec3 = require('vec3').Vec3
const autoeat = require('mineflayer-auto-eat')
var secrets = require('./secrets');
var navigatePlugin = require('mineflayer-navigate')(mineflayer);
var scaffoldPlugin = require('mineflayer-scaffold')(mineflayer);
var requireIndex = require('requireindex');
var fs = require('fs');
var path = require('path');

if (process.argv.length < 4 || process.argv.length > 6) {
  console.log('Usage : node Bot.js <host> <port> [<name>] [<password>]')
  process.exit(1)
}

const bot = mineflayer.createBot({
    host: process.argv[2],
    port: process.argv[3],
    username: process.argv[4] || 'pvp_Bot',
    password: process.argv[5],
    logErrors: false
})

bot.loadPlugin(pvp)
bot.loadPlugin(armorManager)
bot.loadPlugin(pathfinder)
bot.loadPlugin(collectBlock)
bot.loadPlugin(autoeat)
bot.loadPlugin('mineflayer-blockfinder')(mineflayer)

let mcData
bot.once('spawn', () => {
  mcData = require('minecraft-data')(bot.version)
})

bot.once('spawn', () => {
  bot.autoEat.options = {
    priority: 'foodPoints',
    startAt: 14,
    bannedFood: []
  }
})
// The bot eats food automatically and emits these events when it starts eating and stops eating.

bot.on('autoeat_started', () => {
  console.log('Auto Eat started!')
})

bot.on('autoeat_stopped', () => {
  console.log('Auto Eat stopped!')
})

bot.on('health', () => {
  if (bot.food === 20) bot.autoEat.disable()
  // Disable the plugin if the bot is at 20 food points
  else bot.autoEat.enable() // Else enable the plugin again
})

bot.on('spawn', () => {
  const mcData = require('minecraft-data')(bot.version) // You will know the version when the bot has spawned
  const totemId = mcData.itemsByName.totem_of_undying.id // Get the correct id
  if (mcData.itemsByName.totem_of_undying) {
    setInterval(() => {
      const totem = bot.inventory.findInventoryItem(totemId, null)
      if (totem) {
        bot.equip(totem, 'off-hand')
      }
    }, 50)
  }
})

bot.once('spawn', () => {
  mineflayerViewer(bot, { port: 3007, firstPerson: false })
})

bot.on('playerCollect', (collector, itemDrop) => {
  if (collector !== bot.entity) return

  setTimeout(() => {
    const sword = bot.inventory.items().find(item => item.name.includes('sword'))
    if (sword) bot.equip(sword, 'hand')
  }, 150)
})

bot.on('playerCollect', (collector, itemDrop) => {
  if (collector !== bot.entity) return

  setTimeout(() => {
    const shield = bot.inventory.items().find(item => item.name.includes('shield'))
    if (shield) bot.equip(shield, 'off-hand')
  }, 250)
})

let guardPos = null

function guardArea (pos) {
  guardPos = pos.clone()

  if (!bot.pvp.target) {
    moveToGuardPos()
  }
}

function stopGuarding () {
  guardPos = null
  bot.pvp.stop()
  bot.pathfinder.setGoal(null)
}

function moveToGuardPos () {
  const mcData = require('minecraft-data')(bot.version)
  bot.pathfinder.setMovements(new Movements(bot, mcData))
  bot.pathfinder.setGoal(new goals.GoalBlock(guardPos.x, guardPos.y, guardPos.z))
}

bot.on('stoppedAttacking', () => {
  if (guardPos) {
    moveToGuardPos()
  }
})

bot.on('physicTick', () => {
  if (bot.pvp.target) return
  if (bot.pathfinder.isMoving()) return

  const entity = bot.nearestEntity()
  if (entity) bot.lookAt(entity.position.offset(0, entity.height, 0))
})

bot.on('physicTick', () => {
  if (!guardPos) return

  const filter = e => e.type === 'mob' && e.position.distanceTo(bot.entity.position) < 16 &&
                      e.mobType !== 'Armor Stand' 

  const entity = bot.nearestEntity(filter)
  if (entity) {
    bot.pvp.attack(entity)
  }
})

bot.on('chat', (username, message) => {
  if (message === 'guard') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.chat('I will guard that location.')
    guardArea(player.entity.position)
  }

  if (message === 'fight me') {
    const player = bot.players[username]

    if (!player) {
      bot.chat("I can't see you.")
      return
    }

    bot.chat("Prepare to fight,"[username])
    bot.pvp.attack(player.entity)
  }

  if (message === 'stop') {
    bot.chat('I will no longer guard this area.')
    stopGuarding()
  }
})

// wait for chat message 
bot.on('chat', (username, message) => {
  const args = message.split(' ')
  if (args[0] !== 'collect') return

  // Get the correct block type
  const blockType = mcData.blocksByName[args[1]]
  if (!blockType) {
    bot.chat("I don't know any blocks with that name.")
    return
  }

  bot.chat('Collecting the nearest ' + blockType.name)

  // Try and find that block type in the world
  const block = bot.findBlock({
    matching: blockType.id,
    maxDistance: 64
  })

  if (!block) {
    bot.chat("I don't see that block nearby.")
    return
  }

  // Collect the block if we found one
  bot.collectBlock.collect(block, err => {
    if (err) bot.chat(err.message)
  })
})

bot.setTimeout = function (fn, delay) {
  setTimeout(function () {
    if(bot.connected) {
      fn();
    }
  }, delay);
}
navigatePlugin(bot);
scaffoldPlugin(bot);
var plugins = requireIndex(path.join(__dirname, 'lib', 'plugins'));
for (plugin in plugins) {
  if (plugins[plugin].inject != null) {
      plugins[plugin].inject(bot);
  } else {
      console.log(plugin, 'has no inject function.');
  }
}


/*
process.on('uncaughtException', (e) => {
console.log(e);
});
*/

init();
bot.on('chat', (username, message) => {
  if (username === bot.username) return
  const result = /canSee (-?[0-9]+),(-?[0-9]+),(-?[0-9]+)/.exec(message)
  if (result) {
    canSee(new Vec3(result[1], result[2], result[3]))
    return
  }
  switch (message) {
    case 'pos':
      sayPosition(username)
      break
    case 'wearing':
      sayEquipment()
      break
    case 'nick':
      sayNick()
      break
    case 'spawn':
      saySpawnPoint()
      break
    case 'block':
      sayBlockUnder(username)
      break
    case 'quit':
      quit(username)
      break
    default:
      bot.chat("That's nice")
  }

  function canSee (pos) {
    const block = bot.blockAt(pos)
    const r = bot.canSeeBlock(block)
    if (r) {
      bot.chat(`I can see the block of ${block.displayName} at ${pos}`)
    } else {
      bot.chat(`I cannot see the block of ${block.displayName} at ${pos}`)
    }
  }

  function sayPosition (username) {
    bot.chat(`I am at ${bot.entity.position}`)
    bot.chat(`You are at ${bot.players[username].entity.position}`)
  }

  function sayEquipment () {
    const eq = bot.players[username].entity.equipment
    const eqText = []
    if (eq[0]) eqText.push(`holding a ${eq[0].displayName}`)
    if (eq[1]) eqText.push(`wearing a ${eq[1].displayName} on your feet`)
    if (eq[2]) eqText.push(`wearing a ${eq[2].displayName} on your legs`)
    if (eq[3]) eqText.push(`wearing a ${eq[3].displayName} on your torso`)
    if (eq[4]) eqText.push(`wearing a ${eq[4].displayName} on your head`)
    if (eqText.length) {
      bot.chat(`You are ${eqText.join(', ')}.`)
    } else {
      bot.chat('You are naked!')
    }
  }

  function saySpawnPoint () {
    bot.chat(`Spawn is at ${bot.spawnPoint}`)
  }

  function sayBlockUnder () {
    const block = bot.blockAt(bot.players[username].entity.position.offset(0, -1, 0))
    bot.chat(`Block under you is ${block.displayName} in the ${block.biome.name} biome`)
    console.log(block)
  }

  function quit (username) {
    bot.quit(`${username} told me to`)
  }

  function sayNick () {
    bot.chat(`My name is ${bot.player.displayName}`)
  }
})

bot.on('whisper', (username, message, rawMessage) => {
  console.log(`I received a message from ${username}: ${message}`)
  bot.whisper(username, 'I can tell secrets too.')
})
bot.on('nonSpokenChat', (message) => {
  console.log(`Non spoken chat: ${message}`)
})
bot.on('spawn', () => {
  bot.chat('I spawned, watch out!')
})
bot.on('spawnReset', (message) => {
  bot.chat('My bed is broken :/')
})
bot.on('forcedMove', () => {
  bot.chat(`I have been forced to move to ${bot.entity.position}`)
})
bot.on('health', () => {
  bot.chat(`I have ${bot.health} health and ${bot.food} food`)
})
bot.on('death', () => {
  bot.chat('I died x.x')
})
bot.on('kicked', (reason) => {
  console.log(`I got kicked for ${reason}`)
})

bot.on('time', () => {
  bot.chat('Current time: ' + bot.time.timeOfDay)
})
bot.on('rain', () => {
  if (bot.isRaining) {
    bot.chat('It started raining.')
  } else {
    bot.chat('It stopped raining.')
  }
})
bot.on('noteHeard', (block, instrument, pitch) => {
  bot.chat(`Music for my ears! I just heard a ${instrument.name}`)
})
bot.on('chestLidMove', (block, isOpen) => {
  const action = isOpen ? 'open' : 'close'
  bot.chat(`Hey, did someone just ${action} a chest?`)
})
bot.on('pistonMove', (block, isPulling, direction) => {
  const action = isPulling ? 'pulling' : 'pushing'
  bot.chat(`A piston is ${action} near me, i can hear it.`)
})

bot.on('playerJoined', (player) => {
  if (player.username !== bot.username) {
    bot.chat(`Hello, ${player.username}! Welcome to the server.`)
  }
})
bot.on('playerLeft', (player) => {
  if (player.username === bot.username) return
  bot.chat(`Bye ${player.username}`)
})
bot.on('playerCollect', (collector, collected) => {
  if (collector.type === 'player' && collected.type === 'object') {
    const rawItem = collected.metadata[10]
    const item = mineflayer.Item.fromNotch(rawItem)
    bot.chat(`${collector.username !== bot.username ? ("I'm so jealous. " + collector.username) : 'I '} collected ${item.count} ${item.displayName}`)
  }
})

bot.on('entitySpawn', (entity) => {
  if (entity.type === 'mob') {
    console.log(`Look out! A ${entity.mobType} spawned at ${entity.position}`)
  } else if (entity.type === 'player') {
    bot.chat(`Look who decided to show up: ${entity.username}`)
  } else if (entity.type === 'object') {
    console.log(`There's a ${entity.objectType} at ${entity.position}`)
  } else if (entity.type === 'global') {
    bot.chat('Ooh lightning!')
  } else if (entity.type === 'orb') {
    bot.chat('Gimme dat exp orb!')
  }
})
bot.on('entityHurt', (entity) => {
  if (entity.type === 'mob') {
    bot.chat(`Haha! The ${entity.mobType} got hurt!`)
  } else if (entity.type === 'player') {
    bot.chat(`Aww, poor ${entity.username} got hurt. Maybe you shouldn't have a ping of ${bot.players[entity.username].ping}`)
  }
})
bot.on('entitySwingArm', (entity) => {
  bot.chat(`${entity.username}, I see that your arm is working fine.`)
})
bot.on('entityCrouch', (entity) => {
  bot.chat(`${entity.username}: you so sneaky.`)
})
bot.on('entityUncrouch', (entity) => {
  bot.chat(`${entity.username}: welcome back from the land of hunchbacks.`)
})
bot.on('entitySleep', (entity) => {
  bot.chat(`Good night, ${entity.username}`)
})
bot.on('entityWake', (entity) => {
  bot.chat(`Top of the morning, ${entity.username}`)
})
bot.on('entityEat', (entity) => {
  bot.chat(`${entity.username}: OM NOM NOM NOMONOM. That's what you sound like.`)
})
bot.on('entityAttach', (entity, vehicle) => {
  if (entity.type === 'player' && vehicle.type === 'object') {
    bot.chat(`Sweet, ${entity.username} is riding that ${vehicle.objectType}`)
  }
})
bot.on('entityDetach', (entity, vehicle) => {
  if (entity.type === 'player' && vehicle.type === 'object') {
    bot.chat(`Lame, ${entity.username} stopped riding the ${vehicle.objectType}`)
  }
})
bot.on('entityEquipmentChange', (entity) => {
  console.log('entityEquipmentChange', entity)
})
bot.on('entityEffect', (entity, effect) => {
  console.log('entityEffect', entity, effect)
})
bot.on('entityEffectEnd', (entity, effect) => {
  console.log('entityEffectEnd', entity, effect)
})

bot.once('spawn', function() {
  bot.findBlock({
    point: bot.entity.position,
    matching: 10,
    matching: 11,
    maxDistance: 256,
    count: 1,
  }, function(err, blocks) {
    if (err) {
      return bot.chat('/stop' + err);
      bot.quit('quitting');
      return;
    }
    if (blocks.length) {
      bot.chat('/stop');
      bot.quit('quitting');
      return;
    } 
  });
});
