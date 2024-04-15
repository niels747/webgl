#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;

uniform sampler2D baseTex;
uniform sampler2D waterTex;
uniform isampler2D wallTex;
uniform sampler2D lightTex;
uniform sampler2D noiseTex;


uniform vec2 resolution;
uniform vec2 texelSize;

uniform float dryLapse;
uniform float sunAngle;

out vec4 fragmentColor;

#include functions

void main()
{
//vec4 base = texture(baseTex, texCoord);
vec4 base = bilerpWallVis(baseTex, wallTex, fragCoord);
ivec2 wall = texture(wallTex, texCoord).xy;

//vec4 water = texture(waterTex, texCoord);
vec4 water = bilerpWallVis(waterTex, wallTex, fragCoord);
//vec4 water = bilerp(waterTex, fragCoord);

float light = texture(lightTex, texCoord)[0];

light = pow(light , 1./2.2); // gamma correction

//float light = 1.;

float cloudwater = water[1];

if(wall[1] == 0){ // is wall
switch(wall[0]){ // wall type
  case 0: // normal wall
fragmentColor = vec4(0,0,0,1);
break;
  case 1: // land wall

  vec3 groundCol;

if(water[2] < -998.0){ // not at surface
groundCol = vec3(0.10); // dark gray rock
}else{
groundCol = mix(vec3(0.5,0.2,0.1), vec3(0.0, 0.7, 0.2), water[2]/100.); // brown to green, dry earth to grass 
groundCol = mix(groundCol, vec3(1.0), water[3]/100.); // brown/green to white, snow cover
}
fragmentColor = vec4((groundCol + texture(noiseTex, vec2(texCoord.x, texCoord.y * (resolution.y / resolution.x)) * 50.0).rgb * 0.2) * light , 1.0);
break;
  case 2: // water wall
fragmentColor = vec4(vec3(0, 0.5, 1.0) * light, 1);
break;
case 3: // Fire wall
fragmentColor = vec4(1.0, 0.5, 0.0, 1);
break;
}
}else{
   // backgroundCol *= map_range(light, 0.0,1.0, 0.60,1.0);

    vec3 cloudCol = vec3(1.0 / (cloudwater * 0.1 +1.0)); // white to black
    float cloudOpacity = clamp(cloudwater*4.0, 0.0, 1.0);


    cloudOpacity += clamp(1.-(1. / (water[2]+1.)), 0.0, 1.0); // precipitation

    
    float smokeOpacity = clamp(1.-(1. / (water[3]+1.)), 0.0, 1.0);
    //float smokeOpacity = water[3]*0.5; 
    vec3 smokeCol = mix(vec3(0.8, 0.51, 0.26), vec3(0.0, 0.0, 0.0), smokeOpacity);

    float opacity = 1. - (1. - smokeOpacity) * (1. - cloudOpacity); // alpha blending
    vec3 color = (smokeCol * smokeOpacity / opacity) + (cloudCol * cloudOpacity * (1. - smokeOpacity) / opacity); // color blending

    opacity = clamp(opacity, 0.0, 1.0);

    float scatering = clamp((0.15 / max(cos(sunAngle),0.) - 0.15) * (1.0 - texCoord.y*0.99), 0., 1.); // how red the sunlight is
    vec3 lightCol = sunColor(scatering);

    fragmentColor = vec4(vec3(color * lightCol * light) + vec3(0.10), opacity);
}
}