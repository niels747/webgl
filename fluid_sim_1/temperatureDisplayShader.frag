#version 300 es
precision highp float;

in vec2 fragTexCoord;
uniform sampler2D sampler;
out vec4 fragmentColor;

void main()
{
vec4 col = texture(sampler, fragTexCoord);

if(col[0] == 0.0 && col[1] == 0.0) // wall
fragmentColor = vec4(1.0,1.0,1.0,1.0);
else if(col[3] > 0.0)
  fragmentColor = vec4(1.0, 1.0 - col[3], 1.0 - col[3], 1.0);
else
fragmentColor = vec4(1.0 + col[3], 1.0 + col[3], 1.0, 1.0);

//fragmentColor[3] = 1.0;
}