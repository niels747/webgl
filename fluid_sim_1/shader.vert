#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;
out vec2 fragTexCoord;

void main()
{
 fragTexCoord = vertTexCoord;
  gl_Position = vec4(vertPosition, 0.0, 1.0);
}