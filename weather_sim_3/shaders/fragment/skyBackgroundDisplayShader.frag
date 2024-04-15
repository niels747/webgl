#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 fragCoord;
in vec2 texCoord;

uniform sampler2D lightTex;

out vec4 fragmentColor;

void main()
{
  float light = texture(lightTex, texCoord)[0];

  vec3 topBackgroundCol = vec3(0.0,0.0,0.15); // dark blue
  vec3 bottemBackgroundCol = vec3(0.35,0.58,0.80); // milky white blue
  //backgroundCol *= 1.0 - texCoord.y * 0.9; // fade to black at the top


  //fragmentColor = vec4(topBackgroundCol * (light*0.5 + 0.5), 1.0);
  fragmentColor = vec4(mix(bottemBackgroundCol, topBackgroundCol, pow(texCoord.y, 0.4)) * (light*0.5 + 0.5), 1.0);
}