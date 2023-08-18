import fs from 'fs';

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
        };
    });
    const weaponDict = weapons.reduce((acc, weapon) => {
        acc[weapon.name] = weapon;
        return acc;
    }, {});
    
    const ships = unitFiles.map(unitFile => {
            return {
                name: unitFile,
                obj: JSON.parse(fs.readFileSync(entitiesPath + '/' + unitFile))
            };
        })
        .filter(p => p.obj.physics && p.obj.weapons?.weapons)
        .map(shipBundle => {
            const shipRaw = shipBundle.obj;
            return {
                name: shipBundle.name,
                ai: shipRaw.ai,
                target: shipRaw.ai_attack_target,
                accelTime: shipRaw.physics.time_to_max_linear_speed,
                speed: shipRaw.physics.max_linear_speed,
                weapons: shipRaw.weapons.weapons.map((shipWeapon) => weaponDict[shipWeapon.weapon]),
                hull: shipRaw.health.max_hull_points,
                shields: shipRaw.health.max_shield_points,
                mitigation: shipRaw.health.shield_mitigation,
                armor: shipRaw.health.hull_armor,
                supply: shipRaw.build.supply_cost,
                credits: shipRaw.build.price.credits,
                metal: shipRaw.build.price.metal,
                crystal: shipRaw.build.price.crystal
            };
        });
    return ships;
};

const ships = load();
const shipDict = ships.reduce((acc, ship) => {
    acc[ship.name] = ship;
    return acc;
}, {});

const p0 = {
    trader_light_frigate: 10
};
const p1 = {
    trader_long_range_cruiser: 10
};

console.log('Ships: ' + JSON.stringify(ships, null, 4));