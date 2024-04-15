#version 300 es
precision highp float;

in vec2 dropPosition;
in vec2 mass; //[0] water   [1] ice
in float density;

// transform feedback varyings:
out vec2 position_out;
out vec2 mass_out;
out float density_out;

// to fragmentshader for feedback to fluid
// out float fluid_Vy;       // [0] droplet weigth
// out float fluid_temp;     // [1] heating and cooling of fluid
// out float feedback[2];    // [2] evaporation and taking water from cloud
out vec4 feedback;

vec2 texCoord; // for functions

uniform sampler2D baseTex;
uniform sampler2D waterTex;

uniform float dryLapse;
uniform float evapHeat;
uniform float meltingHeat;
uniform vec2 resolution;
uniform vec2 texelSize;
uniform float waterWeight;
uniform float inactiveDroplets; // used to maintain constant spawnrate

uniform float frameNum;

#include functions

void main()
{
    vec2 newPos = dropPosition;
    vec2 newMass = mass; // amount of water and ice carried
    float newDensity = density; // determines fall speed

    if (mass[0] < 0.) { // inactive
        // generate random spawn position: x and y from 0. to 1.
        texCoord = vec2(random(mass[0] * frameNum * 2.4173), random(mass[1] * frameNum * 7.3916));

        // sample fluid at generated position
        vec4 base = texture(baseTex, texCoord);
        vec4 water = texture(waterTex, texCoord);

        // check if position is okay to spawn
        float realTemp = potentialToRealT(base[3]); // in Kelvin
        float treshHold;
        if (realTemp > CtoK(0.0))
            treshHold = 1.0; // in above freezing conditions coalescence only happens in really dense clouds
        else // the colder it gets, the faster ice starts to form
            treshHold = max(map_range(realTemp, CtoK(0.0), CtoK(-30.0), 0.50, 0.0), 0.00);

        if (water[1] > treshHold && base[3] < 500.) { // if cloudwater above treshhold and not wall

            float spawnchance = (water[1] - treshHold) / inactiveDroplets * resolution.x * resolution.y * 0.00015; // 0.00010

            //spawnchance = 1.0; // no precipitation

            if (spawnchance > random(mass[0] * 0.3724 + frameNum + random(mass[1]))) { // spawn
                newPos = vec2((texCoord.x - 0.5) * 2., (texCoord.y - 0.5) * 2.); // convert texture coordinate (0
                // to 1) to position (-1 to 1)

#define initalMass 0.05

                if (realTemp < CtoK(0.0)) {
                    newMass[0] = 0.0; // enable
                    newMass[1] = initalMass; // snow
                    feedback[1] += newMass[1] * meltingHeat;
                    newDensity = 0.5; // 0.2 slow
                } else {
                    newMass[0] = initalMass; // rain
                    newMass[1] = 0.0;
                    newDensity = 1.0;
                }
                feedback[2] -= initalMass;
            }
        }

        if (feedback[2] < 0.0) { // spawned
            gl_PointSize = 1.0;
            gl_Position = vec4(newPos, 0.0, 1.0);
        } else { // still inactive
            feedback[3] = 1.0; // count 1 inactive droplet
            gl_Position = vec4(
                vec2(-1. + texelSize.x, -1. + texelSize.y),
                0.0,
                1.0); // render to bottem left corner (0, 0) to count inactive droplets
        }

    } else { // active
        texCoord = vec2(dropPosition.x / 2. + 0.5,
            dropPosition.y / 2. + 0.5); // convert position (-1 to 1) to texture coordinate (0 to 1)
        vec4 water = texture(waterTex, texCoord);
        vec4 base = texture(baseTex, texCoord);

        float realTemp = potentialToRealT(base[3]); // in Kelvin

        float totalMass = newMass[0] + newMass[1];

        if (totalMass < 0.00001) { // 0.00001   to small

            feedback[2] = totalMass; // evaporation of residual droplet

            gl_PointSize = 1.;
            newMass[0] = -10. + dropPosition.x; // disable droplet and save position as seed for spawning
            newMass[1] = dropPosition.y;
        } else if (newPos.y < -1.0 || base[3] > 500.) { // to low or wall

            if (texture(baseTex, vec2(texCoord.x, texCoord.y + texelSize.y))[3] > 500.) // if above cell was already wall. because of fast fall speed
                newPos.y += texelSize.y * 2.; // move position up

            feedback[2] = newMass[0]; // rain accumulation

            feedback[3] = newMass[1]; // snow accumulation

            gl_PointSize = 1.;
            newMass[0] = -10. + dropPosition.x; // disable droplet and save position as seed for spawning
            newMass[1] = dropPosition.y;
        } else { // update droplet

            float surfaceArea = sqrt(totalMass);
            float growthRate;

            growthRate = max(map_range(realTemp, CtoK(0.0), CtoK(-60.0), 0.0002, 0.003), 0.0002); // the colder it gets the easier ice starts to form

            float growth = water[1] * growthRate * surfaceArea;
            feedback[2] -= growth * 1.0;

            if (realTemp < CtoK(0.0)) { // freezing
                newMass[1] += growth; // ice growth
                feedback[1] += growth * meltingHeat;

                float freezing = min((CtoK(0.0) - realTemp) * 0.0002 * surfaceArea,
                    newMass[0]); // rain freezing
                newMass[0] -= freezing;
                newMass[1] += freezing;
                feedback[1] += freezing * meltingHeat;

            } else { // melting
                newMass[0] += growth; // water growth

                float melting = min((realTemp - CtoK(0.0)) * 0.0015 * surfaceArea / newDensity,
                    newMass[1]); // 0.0002 snow / hail melting
                newMass[1] -= melting;
                newMass[0] += melting;
                feedback[1] -= melting * meltingHeat;

                newDensity = min(newDensity + (melting / totalMass) * 1.00,
                    1.0); // density increases upto 1.0
            }

            float dropletTemp = potentialToRealT(base[3]); // should be wetbulb temperature...

            if (newMass[1] > 0.0) // if any ice
                dropletTemp = min(dropletTemp, CtoK(0.0)); // temp can not be more than 0 C

            float evapAndSubli = max((maxWater(dropletTemp) - water[0]) * surfaceArea * 0.0005,
                0.); // 0.001 evaporation and sublimation only positive

            float evap = min(newMass[0], evapAndSubli);
            float subli = min(newMass[1], evapAndSubli - evap);

            newMass[0] -= evap; // water evaporation
            newMass[1] -= subli; // ice sublimation

            feedback[2] += evap;
            feedback[2] += subli;
            feedback[1] -= evap * evapHeat;
            feedback[1] -= subli * evapHeat;
            feedback[1] -= subli * meltingHeat;

            // move
            newPos += base.xy / resolution * 2.; // move with air       * 2 because -1. to 1.
            newPos.y -= 0.0003 * newDensity * sqrt(totalMass / surfaceArea); // 0.0003 fall speed relative to air

            newPos.x = mod(newPos.x + 1., 2.) - 1.; // wrap horizontal position around edges

            feedback[0] = -totalMass * waterWeight;

#define pntSize 16. // 8
            float pntSurface = pntSize * pntSize;

            feedback[0] /= pntSurface;
            feedback[1] /= pntSurface;
            feedback[2] /= pntSurface;

            gl_PointSize = pntSize;
        } // update

        gl_Position = vec4(newPos, 0.0, 1.0);
    } // active

    position_out = newPos;
    mass_out = newMass;
    density_out = max(newDensity, 0.);
}