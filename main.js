import fs from 'fs';
import chalk from 'chalk';
import { Player } from './player.js';

const green = str => console.log(chalk.green(str));
const red = str => console.log(chalk.red(str));
const blue = str => console.log(chalk.blue(str));
const yellow = str => console.log(chalk.yellow(str));
const magenta = str => console.log(chalk.magenta(str));
const white = str => console.log(chalk.white(str));
const bold = str => console.log(chalk.bold(str));

// #region Load Data
const { goldPath, greedPath } = JSON.parse(fs.readFileSync('./config.json'));

const unitSuffixLength = '.unit'.length;
const weaponSuffixLength = '.weapon'.length;

/**
 * Loads the units from the provided entities directory.
 * @param {string} entitiesPath 
 * @returns {[{name: string, obj: {*}}]}
 */
const loadUnits = (entitiesPath) => {
    if (!fs.existsSync(entitiesPath)) {
        yellow('Warning: directory ' + entitiesPath + ' does not exist');
        return {};
    }
    const unitFiles = fs.readdirSync(entitiesPath).filter(p => p.endsWith('.unit') && p.startsWith('trader_'));
    return unitFiles.reduce((acc, unitFile) => {
        acc[unitFile] = JSON.parse(fs.readFileSync(entitiesPath + '/' + unitFile))
        return acc;
    }, {});
};

/**
 * Turns the unit dictionary into an array of entries.
 * @param {{*}} unitDict 
 * @returns {[{name: string, obj: {*}}]}
 */
const arrifyUnits = (unitDict) => {
    return Object.keys(unitDict).map(k => {
        return {
            name: k,
            obj: unitDict[k]
        };
    });
};

/**
 * Loads in the ships.
 * @param {[{name: string, obj: {*}}]} units 
 * @returns {{*}} A dictionary of ships
 */
const loadTorpedoes = (units) => {
    // Load in torpedo types
    const torpedoes = units.filter(p => p.name.includes('torpedo')).map(torpedoRaw => {
        return {
            name: torpedoRaw.name,
            ai: torpedoRaw.obj.ai,
            aiTarget: torpedoRaw.obj.ai_attack_target,
            accelTime: torpedoRaw.obj.physics.time_to_max_linear_speed,
            speed: torpedoRaw.obj.physics.max_linear_speed,
            hull: torpedoRaw.obj.health.max_hull_points || 0,
            shields: torpedoRaw.obj.health.max_shield_points || 0,
            mitigation: torpedoRaw.obj.health.shield_mitigation || 0,
            armor: torpedoRaw.obj.health.hull_armor || 0,
            type: torpedoRaw.target_filter_unit_type,
            weapons: []// To be filled out when spawned
        };
    });
    return torpedoes.reduce((acc, torpedo) => {
        const key = torpedo.name.substring(0, torpedo.name.length - unitSuffixLength);
        acc[key] = torpedo;
        return acc;
    }, {});
};

/**
 * Loads in the ships.
 * @param {string} entitiesPath 
 * @param {{*}} torpedoDict
 * @returns {{*}} A dictionary of ships
 */
const loadWeapons = (entitiesPath, torpedoDict) => {
    if (!fs.existsSync(entitiesPath)) {
        yellow('Warning: directory ' + entitiesPath + ' does not exist');
        return {};
    }

    // Load in weapon types
    const weaponFiles = fs.readdirSync(entitiesPath).filter(p => p.endsWith('.weapon') && p.startsWith('trader_'));
    const weapons = weaponFiles.map(weaponFile => {
        const weaponPath = entitiesPath + '/' + weaponFile;
        const rawWeapon = JSON.parse(fs.readFileSync(weaponPath));
        const filter = rawWeapon.uniforms_target_filter_id;
        let targetFilter;

        switch (filter) {
            case 'common_weapon':
                targetFilter = ['corvette', 'frigate', 'capital_ship', 'structure', 'titan'];
                break;
            case 'common_weapon_no_corvette_weapon':
                targetFilter = ['frigate', 'capital_ship', 'structure', 'titan'];
                break;
            case 'strikecraft_and_torpedo_weapon':
                targetFilter = ['strikecraft', 'torpedo'];
                break;
            case 'common_and_strikecraft_and_torpedo_weapon':
                targetFilter = ['strikecraft', 'torpedo', 'corvette', 'frigate', 'capital_ship', 'structure', 'titan'];
                break;
            case 'common_and_strikecraft_weapon':
                targetFilter = ['strikecraft', 'corvette', 'frigate', 'capital_ship', 'structure', 'titan'];
                break;
            case 'planet_bombing':
                targetFilter = ['planet', 'corvette', 'frigate', 'capital_ship', 'structure', 'titan'];
                break;
            case 'common_planet_bombing':
                targetFilter = ['planet'];
                break;
            default:
                throw new Error('Unrecognized Type: ' + filter + ' on weapon ' + weaponFile);
        }

        return {
            name: weaponFile.substring(0, weaponFile.length - weaponSuffixLength),
            cooldown: rawWeapon.cooldown_duration,
            range: rawWeapon.range,
            ap: rawWeapon.hull_armor_penetration,
            damage: rawWeapon.damage,
            type: rawWeapon.weapon_type,
            logic: rawWeapon.acquire_target_logic,
            targetFilter,
            salvoSize: rawWeapon.burst_pattern?.length || 1,
            torpedo: torpedoDict[rawWeapon.firing?.torpedo_firing_definition?.spawned_unit]
        };
    });
    return weapons.reduce((acc, weapon) => {
        acc[weapon.name] = weapon;
        return acc;
    }, {});
};

/**
 * Loads in the ships.
 * @param {[{name: string, obj: {*}}]} units 
 * @param {{*}} weaponDict
 * @returns {{*}} A dictionary of ships
 */
const loadShips = (units, weaponDict) => {    
    // Load in ship types
    const shipTypes = units
        .filter(p => p.obj.physics && p.obj.weapons?.weapons)
        .map(shipBundle => {
            const shipRaw = shipBundle.obj;
            const shipObj =  {
                name: shipBundle.name,
                ai: shipRaw.ai,
                aiTarget: shipRaw.ai_attack_target,
                accelTime: shipRaw.physics.time_to_max_linear_speed,
                speed: shipRaw.physics.max_linear_speed,
                weapons: shipRaw.weapons.weapons
                    .map((shipWeapon) => weaponDict[shipWeapon.weapon])
                    .filter(weapon => weapon && weapon.type !== 'planet_bombing'),
                hull: shipRaw.health.max_hull_points || 0,
                shields: shipRaw.health.max_shield_points || 0,
                mitigation: shipRaw.health.shield_mitigation || 0,
                armor: shipRaw.health.hull_armor || 0,
                supply: shipRaw.build?.supply_cost || 0,
                credits: shipRaw.build?.price?.credits || 0,
                metal: shipRaw.build?.price?.metal || 0,
                crystal: shipRaw.build?.price?.crystal || 0,
                type: shipRaw.target_filter_unit_type
            };

            // If it's a capital or titan, assume Level 1.
            if (shipRaw.levels) {
                const level1 = shipRaw.levels.levels[0];
                shipObj.hull = level1.unit_modifiers.additive_values.max_hull_points;
                shipObj.shields = level1.unit_modifiers.additive_values.max_shield_points;
                shipObj.mitigation = level1.unit_modifiers.additive_values.shield_mitigation;
                shipObj.armor = level1.unit_modifiers.additive_values.hull_armor;
            }
            return shipObj;
        });
    const shipDict = shipTypes.reduce((acc, ship) => {
        const key = ship.name.substring(0, ship.name.length - unitSuffixLength);
        acc[key] = ship;
        return acc;
    }, {});
    return shipDict;
};

/**
 * Merge gold and greed into a fresh dictionary.
 * @param {{*}} goldDict
 * @param {{*}} greedDict
 * @returns {{*}} mergedDict
 */
const absorbGreed = (goldDict, greedDict) => {
    const merged = JSON.parse(JSON.stringify(goldDict));
    Object.keys(greedDict).forEach(k => {
        merged[k] = greedDict[k];
    });
    return merged;
};
// #endregion

// #region Simulation
/**
 * Creates a promise that waits for n ms
 * @param {number} ms 
 * @returns {Promise}
 */
const sleep = (ms) => {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
};

/**
 * Executes a simulation run.
 * @param {{*}} shipDict 
 * @param {number} simRuns 
 * @param {{*}} config1 
 * @param {{*}} config2 
 */
const exec = async (shipDict, simRuns, config1, config2) => {
    const p1 = new Player(shipDict, config1, 10000, -1, 'Player1', chalk.yellow);
    const p2 = new Player(shipDict, config2, -10000, 1, 'Player2', chalk.magentaBright);
    
    const simDuration = 600;// n seconds
    const simInterval = 100;// Tick every n ms
    const ticksPerSecond = Math.floor(1000 / simInterval);
    const simTicks = simDuration * 1000 / simInterval;
    let totalExecTicks = 0;
    
    // Repeat simulation for better data.
    for (let j = 0; j < simRuns; j++) {
        bold(`\n==================================\nExecuting Simulation Iteration = ${j}`);
        // Run simulation
        for (let i = 0; i < simTicks; i++) {
            // if (i % (ticksPerSecond) === 0) bold(`Tick [${i}/${simTicks}] (${i * simInterval / 1000 }s)`);

            p1.fleet.forEach(ship => ship.act(p1.fleet, p2.fleet, simInterval));
            p2.fleet.forEach(ship => ship.act(p2.fleet, p1.fleet, simInterval));

            p1.fleet = p1.fleet.filter(ship => !ship.isDead);
            p2.fleet = p2.fleet.filter(ship => !ship.isDead);

            if (p1.fleet.every(ship => ship.isDead)) {
                console.log(p2.color('Player 2 Wins after ' + (i * simInterval / 1000 ) + 's'));
                p2.wins++;
                p2.fleet.forEach(survivor => survivor.printHealth(1));
                totalExecTicks += i;
                break;
            }
            if (p2.fleet.every(ship => ship.isDead)) {
                console.log(p1.color('Player 1 Wins after ' + (i * simInterval / 1000 ) + 's'));
                p1.wins++;
                p1.fleet.forEach(survivor => survivor.printHealth(1));
                totalExecTicks += i;
                break;
            }

            // Run simulation at a speedup.
            // const speedup = 10;
            // await sleep(simInterval / speedup);
        }
        p1.reset();
        p2.reset();
    }
    const avgTime = totalExecTicks * simInterval / (1000 * simRuns);
    bold('\n==================================\nAverage Fight Duration: ' + avgTime + 's');
    bold('P1 Wins: ' + p1.wins);
    bold('P2 Wins: ' + p2.wins);

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
    const r1 = p1.getResults(simRuns);
    const r2 = p2.getResults(simRuns);
    const compile = (results) => {
        Object.keys(results).forEach((key, i) => {
            table[i].push(isNaN(results[key]) ? results[key] : Math.round(results[key] * 100) / 100);
        });
    };
    compile(r1);
    compile(r2);
    console.table(table);
};
// #endregion

green('Loading Data...');
const unitDict = absorbGreed(loadUnits(goldPath), loadUnits(greedPath));
const units = arrifyUnits(unitDict);
const torpedoDict = loadTorpedoes(units);
const weaponDict = absorbGreed(loadWeapons(goldPath, torpedoDict), loadWeapons(greedPath, torpedoDict));
const shipDict = loadShips(units, weaponDict);
green('Loading Complete');

// trader_light_frigate: 1,
// trader_antifighter_frigate: 1,
// trader_long_range_cruiser: 1,
// trader_heavy_cruiser: 1,
// trader_battle_capital_ship: 1,
green('Starting Simulation...');
exec(shipDict, 10,
    {
        trader_battle_capital_ship: 1,
        trader_light_frigate: 2,
        trader_heavy_cruiser: 3,
        trader_antifighter_frigate: 12
    },
    {
        trader_battle_capital_ship: 1,
        trader_light_frigate: 8,
        // trader_antifighter_frigate: 1,
        trader_long_range_cruiser: 8
    }
    );
green('Simulation Complete.');
