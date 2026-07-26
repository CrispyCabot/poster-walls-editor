Create a plan for a poster walls editor web app for me. It should be built on AWS. Feautres should include:
- User management via AWS Cognito
- Users can create 'projects'. Each 'project' should include:
    - Wall dimensions - show a visual editor where you enter exact dimensions in inches (allow a toggle to switch to feet/inches, but default to just showing inches)
        - Walls should support non perfect rectangular walls. For example, there may be doorframes, windows, etc.
        - This visual editor should allow you to put 'templates' in to help shape out the wall, for example from above, a basic image for 'doorframe' 'window', etc. Include a generic 'obstruction' as a catch all that can be used
    - Posters - manual entry for each poster's dimension. Allow optional entries for frame dimensions & color. Default to 1 inch and black.
        - Each poster should allow you to upload an image for it, and require a name for entry
        - When a poster is entered, it should go into a 'pool' of posters
- In the project, after all walls and posters are entered, you should then be able to 'drag and drop' each poster in order to visually arrange the wall to see what it will look like. This display should show the image if uploaded
- The visual display should show either the uploaded image or just a basic rendering of the name entered as well as the frame & it's color
- Allow each user the ability to share their projects. Projects should be optionally private or public. Even if it's private, allow generating a link to 'share' the wall that anybody can click and immediately view (without edit access of course, only the owner can edit it)


Suggest any other features for me to consider that may be missing. Provide the entire stack on AWS and how it will be deployed. It should be deployed via GitHub Actions. An empty repository was created here that this project can be uploaded to: https://github.com/CrispyCabot/poster-walls-editor.git. The app should be deployed using AWS CDK with Cloud formation. Create everything in the open directory and in the specified repo. Top level should include "infrastructure" where the AWS CDK will do it's thing as well as separate directories for "app" and "api".

Use react for the frontend and hono for the backend. Everything in the project should be in typescript.
