#version 300 es
precision highp float;

in float fluid_Vy;       // droplet weigth
in float fluid_temp;     // heating and cooling of fluid
in float fluid_water;    // evaporation and taking water from cloud

in vec4 feedback;

out vec4 fragmentColor;

void main()
{
fragmentColor = vec4(feedback); // feedback to fluid
//fragmentColor = vec4(0.0,fluid_temp, fluid_water, 1.0); // no feedback
}