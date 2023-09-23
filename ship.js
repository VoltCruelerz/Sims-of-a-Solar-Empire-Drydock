let missileId = 0;

export class Ship {
    /**
     * Creates a ship
     * @param {{
     * name: string,
     * ai: {*},
     * target: number,
     * weapons: [{*}],
     * hull: number,
     * shields: number,
     * mitigation: number,
     * armor: number
     * }} shipConfig
     * @param {number} position the starting position
     * @param {number} direction +/- 1 
     * @param {string} id The ID of the ship
     * @param {*} factionColor The chalk color of the faction
     */
    constructor(shipConfig, position, direction, id, factionColor) {
        // Create a clone of the config.
        const data = JSON.parse(JSON.stringify(shipConfig));
        const keys = Object.keys(data);
        keys.forEach(key => {
            this[key] = data[key];
        });
        this.weapons.forEach(weapon => {
            weapon.cooldownRemaining = 0;
        });
        this.maxShields = this.shields;
        this.maxHull = this.hull;
        this.lifetime = 0;
        this.survived = 0;
        this.isDead = false;
        this.startingPosition = position;
        this.position = position;
        this.direction = direction;
        this.id = id;
        this.factionColor = factionColor;
        this.tanked = 0;
        this.dealt = 0;
    }

    reset() {
        this.hull = this.maxHull;
        this.shields = this.maxShields;
        this.lifetime = 0;
        this.isDead = false;
        this.position = this.startingPosition;
        this.weapons.forEach(weapon => {
            weapon.target = null;
            weapon.cooldownRemaining = 0;
        });
        this.target = null;
    }

    /**
     * Take its turn
     * @param {[Ship]} alliedFleet 
     * @param {[Ship]} enemyFleet 
     * @param {number} tickInterval 
     */
    act(alliedFleet, enemyFleet, tickInterval) {
        this.lifetime++;
        if (this instanceof Missile || this.selectTarget(enemyFleet)) {
            this.moveToTarget(tickInterval);
        } else {
            this.print('No primary target. Do not move.');
        }

        // We might still want to attack even if there's no primary target
        // eg the Sova is swarmed by enemy SC with no other foes; the main
        // guns would have no target, but its PD guns would still need to
        // fire.
        this.attack(tickInterval, alliedFleet);
    }

    // #region Targeting
    /**
     * Gets the maximum range of this ship's weapons.
     * @returns {number}
     */
    getMaxRange() {
        return this.weapons.max(p => p.range);
    }

    /**
     * Checks if this outranges the other ship.
     * @param {Ship} otherShip 
     * @returns {boolean}
     */
    outRanges(otherShip) {
        return this.getMaxRange() > otherShip.getMaxRange();
    }

    /**
     * Checks absolute distance to target
     * @returns {number}
     */
    getDistanceToTarget(target = this.target) {
        return Math.abs(this.position - target.position);
    }

    /**
     * Checks if a weapon is in range
     * @param {{range: number}} weapon 
     * @param {Ship} target 
     * @returns {boolean}
     */
    weaponInRange(weapon, target = weapon.target) {
        return weapon.range >= this.getDistanceToTarget(target);
    }

    /**
     * Checks if all onboard weapons can hit the target.
     * @returns {boolean}
     */
    allWeaponsCanHit() {
        // If a secondary weapon doesn't have a weapon, ignore it.
        return this.weapons
            .filter(weapon => weapon.target)
            .every((weapon) => this.weaponInRange(weapon, this.target || weapon.target));
    }

    shuffle(arr) {
        let currentIndex = arr.length;
        let randomIndex;

        // While there remain elements to shuffle.
        while (currentIndex != 0) {
            // Pick a remaining element.
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex--;
        
            // And swap it with the current element.
            [arr[currentIndex], arr[randomIndex]] = [arr[randomIndex], arr[currentIndex]];
        }
      
        return arr;
    }

    /**
     * Selects the next target from the hostile fleet
     * 
     * There are three target logic options available for weapons:
     * 1. best_target_in_range
     * 2. order_target_only
     * 3. order_target_or_best_target_in_range
     * 
     * For our purposes the "order target" will be the primary weapon's target.
     * #2 will NOT be able to target the same ship.
     * #3 can, but won't necessarily.
     * 
     * @param {[Ship]} hostileFleet 
     */
    selectTarget(hostileFleet) {
        this.weapons.forEach((weapon, i) => {
            // First, narrow the selection to the things this weapon can fire upon.
            const possibleTargets = hostileFleet
                .filter(enemyShip => weapon.targetFilter.includes(enemyShip.type) && !enemyShip.isDead);

            // Second, attempt to narrow to one that's already in range.
            const validTargetsInRange = possibleTargets
                .filter(enemyShip => this.weaponInRange(weapon, enemyShip));
            // this.print(`- Weapon[${i}]: ${validTargetsInRange.length} targets in range among ${possibleTargets.length} valid targets among a fleet of ${hostileFleet.length}.`);

            // If no target is in range, default to the fleet as a whole.
            const targetOptions = validTargetsInRange.length > 0
                ? validTargetsInRange
                : possibleTargets;

            // If the weapon MUST fire on the primary target, just copy it.
            if (weapon.logic === 'order_target_only' && i !== 0) {
                weapon.target = this.weapons[0];
            }

            // Shuffle a clone of the list so that different weapons can select different targets.
            let weaponTargetOptions = this.shuffle([...targetOptions]);

            // If the weapon must NOT target the primary target, remove the primary target from the list.
            if (weapon.logic === 'best_target_in_range') {
                weaponTargetOptions = weaponTargetOptions.filter(option => option !== this.target);
            }

            // Choose a target from among those listed, defaulting to the previous target.
            weapon.target = !weapon.target || weapon.target.isDead
                ? null
                : weapon.target;
            weapon.targetPriority = !weapon.target || weapon.target.isDead
                ? Number.MIN_SAFE_INTEGER
                : weapon.targetPriority;
            
            weaponTargetOptions.forEach((opt) => {
                let priority = opt.aiTarget.attack_priority;
                priority += this.getTargetOptionSpecialPriority(opt);
    
                if (priority > weapon.targetPriority) {
                    // this.print(`- - Prioritizing New Target: ${opt.id} with priority ${priority}`);
                    weapon.target = opt;
                    weapon.targetPriority = priority;
                }
            });

            // If this is the primary gun or there is no target, mark the overall ship's targeting.
            if (i === 0) {
                this.target = weapon.target;
                this.targetPriority = weapon.targetPriority;
            }
        });
        return this.target;
    }

    getTargetOptionSpecialPriority(targetOption) {
        const priorities = this.ai.priority_bonus_per_attack_target_type;
        const bonus = (targetOption.aiTarget.attack_target_types || []).reduce((sum, type) => {
            sum += priorities[type] || 0
            return sum;
        }, 0);
        return bonus;
    }

    /**
     * Sets the target to the provided ship.
     * @param {Ship} targetShip 
     */
    setTarget(targetShip) {
        this.target = targetShip;
    }
    // #endregion

    // #region Movement
    /**
     * Moves toward a target ship until we're in range.
     * @param {number} tickInterval - The number of ms to simulate passing.
     */
    moveToTarget(tickInterval) {
        const distancePerMs = this.getVelocity(tickInterval) / 1000;
        const tickDistance = distancePerMs * tickInterval;
        if (!this.allWeaponsCanHit()) {
            if (this.getDistanceToTarget() < tickDistance) {
                this.position = this.position + (this.getDistanceToTarget() * this.direction);
            } else {
                this.position = this.position + (tickDistance * this.direction);
            }
            this.print('Moved to ' + this.position);
        }
    }

    /**
     * Updates and returns the velocity in units per second, NOT per tick.
     * @param {number} tickInterval 
     * @returns {number} The current distance traveled per second.
     */
    getVelocity(tickInterval) {
        const ticksToAccelerate = Math.floor(1000 * this.accelTime / tickInterval);
        // Accelerate, if we can
        if (this.lifetime > ticksToAccelerate) {
            return this.speed;
        } else {
            const velocity = this.speed * (this.lifetime / ticksToAccelerate);
            this.print("Accelerate to " + Math.round(velocity));
            return velocity;
        }
    }
    // #endregion

    // #region Attack
    /**
     * This ship attacks its target
     * @param {number} tickInterval 
     * @param {[Ship]} alliedFleet 
     */
    attack(tickInterval, alliedFleet) {
        this.weapons.forEach((weapon, i) => this.fire(weapon, tickInterval, i, alliedFleet));
    }

    /**
     * Attempts to fire a given weapon.
     * @param {{
     * damage: number,
     * cooldown: number,
     * range: number,
     * ap: number,
     * cooldownRemaining: number
     * }} weapon The weapon to attempt to fire or reload
    * @param {number} tickInterval 
     * @param {number} i The index of the weapon on the ship 
     * @param {[Ship]} alliedFleet 
     */
    fire(weapon, tickInterval, i, alliedFleet) {
        if (weapon.cooldownRemaining <= 0) {
            // The weapon is ready to fire, so check range to target.
            if (weapon.target && this.weaponInRange(weapon)) {
                // For missiles and torpedoes, we need to spawn a missile.
                if (weapon.name.endsWith('missile') || weapon.name.endsWith('torpedo')) {
                    this.print(`Weapon[${i}] Launching Salvo of ${weapon.salvoSize} (${weapon.name})`);
                    // Technically these should be on a delay, but it makes very little difference since
                    // it's always lower than PD gun cooldown times.
                    const dmgPerMissile = weapon.damage / weapon.salvoSize;
                    for (let j = 0; j < weapon.salvoSize; j++) {
                        const missile = new Missile(this, weapon.target, dmgPerMissile, weapon.ap, weapon.torpedo);
                        // We need to spawn missiles at the start of the fleet list.
                        // Otherwise, it's possible missiles could land without PD
                        // getting a chance to shoot them down.
                        alliedFleet.unshift(missile);
                    }
                } else {
                    this.print(`Weapon[${i}] Firing (${weapon.name}) for ${weapon.damage} (ap=${weapon.ap})`);
                    // Normal weapons play animations repeatedly, but only actually deal a single damage instance.
                    this.dealt += weapon.target.takeDamage(weapon.damage, weapon.ap);
                }
                weapon.cooldownRemaining += weapon.cooldown * 1000;
            }
        } else {
            // The simulation tick is not infinitely small, so allow this to temporarily
            // go negative.
            weapon.cooldownRemaining = weapon.cooldownRemaining - tickInterval;
        }
    }

    /**
     * Deals damage to the ship
     * @param {number} damage 
     * @param {number} piercing 
     * @returns {number} the actual damage dealt, across both shields and hull, after mitigation and armor
     */
    takeDamage(damage, piercing) {
        let dealt = 0;

        // Deal damage to shields first
        if (this.shields > 0) {
            damage -= this.mitigation;
            this.tanked += this.mitigation;
            damage = Math.max(0, damage);
            if (damage > this.shields) {
                dealt += this.shields;
            } else {
                dealt += damage;
            }
            this.shields -= damage;
            damage = 0;
        }
        if (this.shields < 0) {
            damage = -this.shields;
            this.shields = 0;
        }

        // If damage remains, hit the hull.
        if (damage > 0) {
            const armorDiff = Math.max(0, this.armor - piercing);
            const afterArmor = damage / (1 + (0.01 * armorDiff));
            this.tanked += damage - afterArmor;
            this.hull -= afterArmor;
            if (this.hull < 0) {
                // Hull is negative here, so we don't want to count overkill damage
                // If multiple enemies were focused on this ship, clamp dealt floor to 0.
                dealt += Math.max(0, afterArmor + this.hull);
            } else {
                dealt += afterArmor;
            }
        }
        this.printHealth(1);
        if (this.hull <= 0) {
            this.isDead = true;
            this.print('DEAD', 2);
        }
        return dealt;
    }
    // #endregion

    printHealth(depth = 0, force = false) {
        this.print(`Shields ${Math.round(this.shields)}/${this.maxShields}, Hull ${Math.round(this.hull)}/${this.maxHull}`, depth, force);
    }

    print(str, depth = 0, force = false) {
        str = `- ${this.factionColor(this.id)}: ${str}`;
        str = str.padStart(str.length + 4 * depth, ' ');
        if (process.argv.includes('-debug') || force) {
            console.log(str);
        }
    }

    markSurvived() {
        this.printHealth(1, true);
        this.survived++;
    }
}


class Missile extends Ship {
    /**
     * Creates a missile
     * @param {Ship} spawner 
     * @param {Ship} target 
     * @param {number} damage 
     * @param {number} piercing 
     * @param {{hull: number, speed: number}} config 
     */
    constructor(spawner, target, damage, piercing, config) {
        super(config, spawner.position, spawner.direction, `${spawner.id}_Missile[${missileId++}]`, spawner.factionColor);
        this.spawner = spawner;
        this.target = target;
        this.type = 'torpedo';
        this.weapons.push({
            range: 0,
            damage,
            target,
            ap: piercing
        });
    }

    /**
     * Missiles "fire" when they hit their target.
     * @param {{target: Ship, damage: number, ap: number}} weapon 
     * @param {*} _tickInterval 
     * @param {*} _i 
     * @param {*} _alliedFleet 
     */
    fire(weapon, _tickInterval, _i, _alliedFleet) {
        this.print('DETONATE for ' + weapon.damage);
        this.spawner.dealt += weapon.target.takeDamage(weapon.damage, weapon.ap);
        this.isDead = true;
    }

    selectTarget(_hostileFleet) {
        // Do nothing. Weapons cannot acquire new targets.
    }
}