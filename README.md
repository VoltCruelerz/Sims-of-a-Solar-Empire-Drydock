# Sims of a Solar Empire: Drydock

_A simulation sandbox for Sins of a Solar Empire II._

## What It Is

- a combat simulation that automatically loads in the ship data from your Sins II directory.
  - the formulas and performance have been ground truthed for single-weapon ships
- you can throw whatever ships you want against each other and see the results.

### Limitations

- the combat encounter is 1-dimensional, and combatants are assumed to be charging toward each other at speed from outside everyone's range when the simulation starts.
  - Consequently, turret tracking and range of motion are not accounted for (though their targeting logic _is_)
  - This makes range slightly less valuable, but not substantially so.
- research is not accounted for
- abilities are not accounted for

#### DPS Limitations

- While DPS is the standard metric, there are some severe limitations to it.
  - For example, while Fighter autocannons have a cooldown of only 10 seconds, they waste up to 2 seconds lining up for their passes.
- Missiles can lose out on DPS for two main reasons: they can be shot down, and surprisingly, they can miss.
  - I don't believe missing is intended behavior, but missiles really struggle to find their way back to a target that moved out of the way, though this was improved in `1.16.7`.

## Execution

1. Set `config.js` to reflect your system so Drydock can find the files.
2. Update `encounter.js`'s engagement lists to whatever you want to simulate.
3. `npm install`
4. `node main.js`
  1. `-test` to use test path instead of live path.
  2. `-runs=n` to set the number of test runs. Default is 10.
