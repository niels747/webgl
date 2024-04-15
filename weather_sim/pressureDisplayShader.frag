#version 300 es
precision highp float;

in vec2 texCoord;
uniform sampler2D sampler;
out vec4 fragmentColor;

void main()
{
vec4 col = texture(sampler, texCoord);

if(col[2] > 0.0)
  fragmentColor = vec4(abs(col[2])*100.0,0,0,1);
else
fragmentColor = vec4(0,0,abs(col[2])*100.0,1);

}