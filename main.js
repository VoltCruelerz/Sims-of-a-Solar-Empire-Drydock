import fs from 'fs';
import chalk from 'chalk';
import { Encounter } from './encounter.js';
import { Param, ParamType, getParams } from './params.js';

const green = str => console.log(chalk.green(str));
const red = str => console.log(chalk.red(str));
const blue = str => console.log(chalk.blue(str));
const yellow = str => console.log(chalk.yellow(str));
const magenta = str => console.log(chalk.magenta(str));
const white = str => console.log(chalk.white(str));
const bold = str => console.log(chalk.bold(str));

// #region Params
const {
    isTest,
    runs
} = getParams([
    new Param('test', ParamType.Boolean, { alias: 'isTest' }),
    new Param('runs', ParamType.Integer, { defaultValue: 10 })
]);

const { livePath, testPath, greedPath } = JSON.parse(fs.readFileSync('./config.json'));
const goldPath = isTest ? testPath : livePath;
bold('Simulating for ' + goldPath);
// #endregion

// #region Load Data
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
    const unitFiles = fs.readdirSync(entitiesPath).filter(p => p.endsWith('.unit') && (p.startsWith('trader_') || p.startsWith('vasari_')));
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
    const weaponFiles = fs.readdirSync(entitiesPath).filter(p => p.endsWith('.weapon') && (p.startsWith('trader_') || p.startsWith('vasari_')));
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

green('Loading Data...');
const unitDict = absorbGreed(loadUnits(goldPath), loadUnits(greedPath));
const units = arrifyUnits(unitDict);
const torpedoDict = loadTorpedoes(units);
const weaponDict = absorbGreed(loadWeapons(goldPath, torpedoDict), loadWeapons(greedPath, torpedoDict));
const shipDict = loadShips(units, weaponDict);
green('Loading Complete');

green('Starting Simulation...');

Encounter.EarlyBattles.forEach(battle => battle.exec(shipDict, runs));

green('Simulation Complete for ' + (isTest ? 'TEST' : 'LIVE'));
