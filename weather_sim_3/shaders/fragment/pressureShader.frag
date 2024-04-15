#version 300 es
precision highp float;
precision highp sampler2D;
precision highp isampler2D;

in vec2 texCoord; // this
in vec2 texCoordXmY0; // left
in vec2 texCoordX0Ym; // down

uniform sampler2D baseTex;
uniform isampler2D wallTex;

layout(location=0) out vec4 base;
layout(location=2) out ivec2 wall;

/*
[0] = vx
[1] = vy
[2] = p
[3] = t
*/

void main()
{
  base = texture(baseTex, texCoord);
  vec4 baseXmY0 = texture(baseTex, texCoordXmY0);
  vec4 baseX0Ym = texture(baseTex, texCoordX0Ym);

  wall = texture(wallTex, texCoord).xy;

  // if(texCoord.y > 0.99)
  // base[2] = 0.0;
  // else

  base[2] += (baseXmY0[0] - base[0] + baseX0Ym[1] - base[1]) * 0.40; // 0.40 lower multiplier dampenes pressure waves, max 0.5      pressure changes proportional to the net in or outflow, to or from the cell.
}

