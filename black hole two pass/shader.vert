#version 300 es
precision highp float;

in vec2 vertPosition;
in vec2 vertTexCoord;
uniform float time;

out vec2 fragTexCoord;



void main()
{
 fragTexCoord = vertTexCoord;

 //if(vertPosition.x > 0.5)
 //gl_Position = vec4(vertPosition, 0.0, time);
//else
  gl_Position = vec4(vertPosition, 0.0, 1.0);
}