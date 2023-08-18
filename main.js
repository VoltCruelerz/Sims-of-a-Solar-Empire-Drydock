import fs from 'fs';
import { Player } from './player.js';
import chalk from 'chalk';

const green = str => console.log(chalk.green(str));
const red = str => console.log(chalk.red(str));
const blue = str => console.log(chalk.blue(str));
const yellow = str => console.log(chalk.yellow(str));
const magenta = str => console.log(chalk.magenta(str));
const white = str => console.log(chalk.white(str));
const bold = str => console.log(chalk.bold(str));

const entitiesPath = 'E:/Epic Games/SinsII/entities';

const weaponFiles = fs.readdirSync(entitiesPath).filter(p => p.endsWith('.weapon') && p.startsWith('trader_'));
const unitFiles = fs.readdirSync(entitiesPath).filter(p => p.endsWith('.unit') && p.startsWith('trader_'));

const load = () => {
    const weaponSuffixLength = '.weapon'.length;
    const weapons = weaponFiles.map(weaponFile => {
        const weaponPath = entitiesPath + '/' + weaponFile;
        const rawWeapon = JSON.parse(fs.readFileSync(weaponPath));
        return {
            name: weaponFile.substring(0, weaponFile.length - weaponSuffixLength),
            cooldown: rawWeapon.cooldown_duration,
            range: rawWeapon.range,
            ap: rawWeapon.hull_armor_penetration,
            damage: rawWeapon.damage,
            type: rawWeapon.weapon_type
        };
    });
    const weaponDict = weapons.reduce((acc, weapon) => {
        acc[weapon.name] = weapon;
        return acc;
    }, {});
    
    const shipTypes = unitFiles.map(unitFile => {
            return {
                name: unitFile,
                obj: JSON.parse(fs.readFileSync(entitiesPath + '/' + unitFile))
            };
        })
        .filter(p => p.obj.physics && p.obj.weapons?.weapons)
        .map(shipBundle => {
            const shipRaw = shipBundle.obj;
            if (shipRaw.levels) {
                const level1 = shipRaw.levels.levels[0];
                return {
                    name: shipBundle.name,
                    ai: shipRaw.ai,
                    aiTarget: shipRaw.ai_attack_target,
                    accelTime: shipRaw.physics.time_to_max_linear_speed,
                    speed: shipRaw.physics.max_linear_speed,
                    weapons: shipRaw.weapons.weapons
                        .map((shipWeapon) => weaponDict[shipWeapon.weapon])
                        .filter(weapon => weapon.type !== 'planet_bombing'),
                    hull: level1.unit_modifiers.additive_values.max_hull_points,
                    shields: level1.unit_modifiers.additive_values.max_shield_points,
                    mitigation: level1.unit_modifiers.additive_values.shield_mitigation,
                    armor: level1.unit_modifiers.additive_values.hull_armor,
                    supply: shipRaw.build?.supply_cost || 0,
                    credits: shipRaw.build?.price?.credits || 0,
                    metal: shipRaw.build?.price?.metal || 0,
                    crystal: shipRaw.build?.price?.crystal || 0
                };
            } else {
                return {
                    name: shipBundle.name,
                    ai: shipRaw.ai,
                    aiTarget: shipRaw.ai_attack_target,
                    accelTime: shipRaw.physics.time_to_max_linear_speed,
                    speed: shipRaw.physics.max_linear_speed,
                    weapons: shipRaw.weapons.weapons.map((shipWeapon) => weaponDict[shipWeapon.weapon]),
                    hull: shipRaw.health.max_hull_points,
                    shields: shipRaw.health.max_shield_points,
                    mitigation: shipRaw.health.shield_mitigation,
                    armor: shipRaw.health.hull_armor,
                    supply: shipRaw.build?.supply_cost || 0,
                    credits: shipRaw.build?.price?.credits || 0,
                    metal: shipRaw.build?.price?.metal || 0,
                    crystal: shipRaw.build?.price?.crystal || 0
                };
            }
        });

    
    const unitSuffixLength = '.unit'.length;
    const shipDict = shipTypes.reduce((acc, ship) => {
        const key = ship.name.substring(0, ship.name.length - unitSuffixLength);
        acc[key] = ship;
        return acc;
    }, {});
    return shipDict;
};

const exec = (shipDict) => {
    const p1 = new Player(shipDict, {
        // trader_light_frigate: 12
        // trader_long_range_cruiser: 10
        // trader_heavy_cruiser: 6
        trader_battle_capital_ship: 1
    }, 10000, -1, 'Player1', chalk.yellow);
    const p2 = new Player(shipDict, {
        trader_long_range_cruiser: 1
    }, -10000, 1, 'Player2', chalk.magentaBright);
    
    const simDuration = 600;// n seconds
    const simInterval = 100;// Tick every n ms
    const ticksPerSecond = Math.floor(1000 / simInterval);
    const simTicks = simDuration * 1000 / simInterval;
    
    // Run simulation
    for (let i = 0; i < simTicks; i++) {
        if (i % (10 * ticksPerSecond) === 0) bold(`Tick [${i}/${simTicks}] (${i * simInterval / 1000 }s)`);

        p1.fleet.forEach(ship => ship.act(p2.fleet, simInterval));
        p2.fleet.forEach(ship => ship.act(p1.fleet, simInterval));

        p1.fleet = p1.fleet.filter(ship => !ship.isDead);
        p2.fleet = p2.fleet.filter(ship => !ship.isDead);

        if (p1.fleet.every(ship => ship.isDead)) {
            green('Player 2 Wins after ' + (i * simInterval / 1000 ) + 's');
            p2.fleet.forEach(survivor => survivor.printHealth(1));
            break;
        }
        if (p2.fleet.every(ship => ship.isDead)) {
            green('Player 1 Wins after ' + (i * simInterval / 1000 ) + 's');
            p1.fleet.forEach(survivor => survivor.printHealth(1));
            break;
        }
    }

    // Compile results
    const table = [
        ['Player'],
        ['Dealt'],
        ['Tanked'],
        ['Performance'],
        ['Supply'],
        ['Credits'],
        ['Metal'],
        ['Crystal'],
        ['Resources'],
        ['PPS'],
        ['PPR']
    ];
    const r1 = p1.getResults();
    const r2 = p2.getResults();
    const compile = (results) => {
        Object.keys(results).forEach((key, i) => {
            table[i].push(isNaN(results[key]) ? results[key] : Math.round(results[key] * 100) / 100);
        });
    };
    compile(r1);
    compile(r2);
    console.table(table);
};

green('Loading Data...');
const shipDict = load();
green('Starting Simulation...');
exec(shipDict);
green('Simulation Complete.');
