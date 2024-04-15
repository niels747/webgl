#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;

uniform vec2 texelSize;

// texure positions. p = plus 1      m = minus 1
out vec2 texCoord; // this
out vec2 texCoordXmY0; // left
out vec2 texCoordXpY0; // right
out vec2 texCoordX0Yp; // up
out vec2 texCoordX0Ym; // down

void main()
{
  texCoord = vertTexCoord;
  texCoordXmY0 = vertTexCoord - vec2(texelSize.x, 0.0);
  texCoordXpY0 = vertTexCoord + vec2(texelSize.x, 0.0);
  texCoordX0Yp = vertTexCoord + vec2(0.0, texelSize.y);
  texCoordX0Ym = vertTexCoord - vec2(0.0, texelSize.y);

  gl_Position = vec4(vertPosition, 0.0, 1.0);
}