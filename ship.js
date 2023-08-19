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
        this.isDead = false;
        this.position = position;
        this.direction = direction;
        this.id = id;
        this.factionColor = factionColor;
        this.tanked = 0;
        this.dealt = 0;
    }

    /**
     * Take its turn
     * @param {[Ship]} enemyFleet 
     * @param {number} tickInterval 
     */
    act(enemyFleet, tickInterval) {
        this.selectTarget(enemyFleet);
        this.moveToTarget(tickInterval);
        this.attack(tickInterval);
    }

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
    allWeaponsCanHit(target) {
        // If a secondary weapon doesn't have a weapon, ignore it.
        return this.weapons
            .filter(weapon => weapon.target)
            .every(weapon => this.weaponInRange(weapon, target));
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
            // First, attempt to find a target in range
            const targetsInRange = hostileFleet.filter(enemyShip => this.weaponInRange(weapon, enemyShip));

            // If no target is in range, default to the fleet as a whole.
            const targetOptions = targetsInRange.length > 0
                ? targetsInRange
                : hostileFleet;

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
                    this.print(`Weapon[${i}] Prioritizing New Target: ${opt.id} with priority ${priority}`);
                    weapon.target = opt;
                    weapon.targetPriority = priority;
                }
            });

            // If this is the primary gun, mark the overall ship's targeting.
            if (i === 0) {
                this.target = weapon.target;
                this.targetPriority = weapon.targetPriority;
            }
        });

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

    /**
     * Moves toward a target ship until we're in range.
     * @param {number} tickInterval - The number of ms to simulate passing.
     */
    moveToTarget(tickInterval) {
        const tickDistance = this.speed * tickInterval / 1000;
        if (!this.allWeaponsCanHit(this.target)) {
            if (this.getDistanceToTarget() < this.speed) {
                this.position = this.position + (this.getDistanceToTarget() * this.direction);
            } else {
                this.position = this.position + (this.speed * this.direction);
            }
            this.print('Moved to ' + this.position);
        }
    }

    /**
     * This ship attacks its target
     * @param {number} tickInterval 
     */
    attack(tickInterval) {
        this.weapons.forEach((weapon, i) => this.fire(weapon, tickInterval, i));
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
     */
    fire(weapon, tickInterval, i) {
        if (weapon.cooldownRemaining <= 0) {
            // The weapon is ready to fire, so check range to target.
            if (this.weaponInRange(weapon)) {
                this.print(`Firing [${i}]: ${weapon.name}`);
                this.dealt += weapon.target.takeDamage(weapon.damage, weapon.ap);
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
        this.tanked += damage;
        let dealt = 0;
        if (this.shields > 0) {
            damage -= this.mitigation;
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
        if (damage > 0) {
            const armorDiff = Math.max(0, this.armor - piercing);
            const afterArmor = damage / (1 + (0.01 * armorDiff));
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

    printHealth(depth = 0) {
        this.print(`Shields ${this.shields}/${this.maxShields}, Hull ${this.hull}/${this.maxHull}`, depth);
    }

    print(str, depth = 0) {
        str = `- ${this.factionColor(this.id)}: ${str}`;
        str = str.padStart(str.length + 4 * depth, ' ');
        console.log(str);
    }
}