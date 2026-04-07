0:066초Hello guys, welcome to another video. In today's tutorial, we're going to show you guys how to run paper clip with Hermes agent and also the Gmail 4 LM
0:1414초which was just released by Google. That being said, let's get started. So, first I'm going to show you how to run the paper clip with Hermes agent and then
0:2121초we're going to show you guys how to set that up. So if you want to run paper clip with Hermes agent just go to the agent section and hit the plus sign and
0:2929초you want to create advanced agent. So then select the hermise agent and put in the agent name and also they
0:3636초have to type as hermise agent and also maybe some of the prompt template. They have default prompt template but you can just specify your own prompt template.
0:4444초Then the command is hermise. Make sure the hermise is in the system path or you have to set up the command with the absolute path. So for example, we
0:5353초created a CML with the Hermes agent and [snorts] go to the configuration. You can see that uh we set up the command as absolute path for Hermes. If you have
1:001분set up this as a system path, then you just can specify Hermes as the command.
1:061분 6초Also another benefit is once you run the test environment,
1:101분 10초it actually will read the uh system pass. So you can see everything has been set up for paperclip. So that's it. Um you can pick your own models for Hermes.
1:191분 19초for example, you can pick the GMR 426B,
1:211분 21초which is the one that we're using for this demo. Um, so that should be it. So once all set up, then you can just click
1:281분 28초create agent. Then you should be able to have a agent like the one that you see here. So then you can assign task to
1:381분 38초this promise agent. For example, we tried the marketing uh research report
1:461분 46초and one of the task for this agent is to create a marketing research report for
1:541분 54초the agent harness. So I ask it to search the web and summarize it. So once everything
2:012분 1초is completed, it will generate a report like you see in here. So [snorts]
2:082분 8초basically it shows that um the agent harness is a critical execution infrastructure that transforms a large
2:172분 17초language model for agent and then it has all the different details differentiators and context management so on so forth. However uh very sort of
2:262분 26초interesting thing you can see that there's a diverse command. So this is one of the problems that a lot of people have. So this we're going to something that we're going to talk about later.
2:352분 35초you have to configure her Hermes so that it will bypass the scan. So we'll talk about that later in this video. So uh
2:432분 43초once that was configured then you can run the Hermes agent with the paper uh paper clip without any problems. So that
2:522분 52초said let's continue. So if you want to set everything up then uh you can just
2:592분 59초uh go through the steps that I'm going to talk about later in this video. So first you have to install the OAMA. So
3:073분 7초we have set up the OAMA with KGO. Uh so you can see KO has two GPUs and also KGO has one uh CPU which is like 30 gigs.
3:163분 16초The GPUs are 15 gigs each. So you have a total of 30 gigs of VRAM. So which is great. Then you can set up the GMA 4 26B
3:263분 26초with the uh KGO. So after everything is set up, you can see we have the GMA 4.
3:313분 31초This is the 4B uh model E4B and then you also have the 26B and also the 26B with non-thinking mode. So when that's ready,
3:413분 41초so you can set up the Hermes agent. So you can go to the Hermes offshore apple.
3:453분 45초Um just follow this command line. So quick install, you can install Hermes and once that's done, you have to
3:553분 55초configure the Hermise if you want. uh but if you have specified uh the configuration such as the LM and the
4:034분 3초securities then you do not have to configure anything but if you have not just uh uh go to this uh Hermes
4:114분 11초configuration and you can configure everything. So for example, if you have set up the Hermes and you uh want to use the KGO LM with Lama and with the GMA 4,
4:224분 22초then you can just select uh also configure the Hermes as I'm pointing to the base URL
4:304분 30초which is the Olama uh KGO base URL that you saw earlier and also the GMA 426P.
4:374분 37초So that's it. So then you can start uh talking to Hermes as you can see here.
4:424분 42초So you can just chat with hi and also uh you can just ask uh you know what skills do you
4:494분 49초have and you know what tools do you have so on so forth and then you can also submit the uh spin up the sub agent. So
4:574분 57초you can say uh I want to run a certain task as a sub agent. So for example uh I
5:045분 4초can uh I want to basically break down and also dedicate to uh some tasks to sub agent and basically research the
5:125분 12초latest news about a agent also compare permiss agent with open claw and summarize the top five github issues and
5:205분 20초we want to use parallel sub aent then you can see something like this which is to spin up all different task within the sub aent so that should be your horm
5:295분 29초conversion uh there's one important thing we mentioned earlier uh which is to configure the security. So if you
5:365분 36초want to use Hermes with uh paperclipip then there's one important thing you have to install which is the adapter. So
5:445분 44초once you install the Hermes then you have to install the Hermes paperclipip adapter and only thing you have to do is
5:515분 51초to just do a mpm install Hermes paperclipip adapter. Once that's ready,
5:565분 56초one more thing to do is to config the Hermes to allow uh the actions inside the Hermes paper clip adapter, which I
6:056분 5초didn't mention anything in here, but if you go to the Hermes agent uh offshore ripple, there's a documentation called
6:126분 12초user guidance and then there's a security section. Then make sure you read the approval modes. So the first one is basically manual, that's by default. And then you have the smart
6:216분 21초which is using the LM to decide uh to prove or not. There's off basically all proof tracks. So depends on situation
6:286분 28초you can choose them wisely. So once you actually turn them off for example they turn everything to a yolo mode which is
6:366분 36초bypass all uh commands. So which is um something that you should uh be concerned about but um you can choose
6:436분 43초any of this for testing. So there's a good explanation for the security layer of the Hermes agent for example uh what
6:506분 50초triggers approval. So we can read through the documented to understand like how to configure the approvals uh list so that um you have a better
6:586분 58초security on your local machine. Uh so also they have a very detailed demonstration about the security system
7:067분 6초they use which is called tar I think it's called par. So um there's uh pretty much uh open source project that show
7:147분 14초you how ter works for uh the security layer and they actually uh there's configuration in the harness configuration. So you can uh complicate
7:237분 23초the security uh for tyrus. So you can uh enable it or disable it and there's a path for that. There's um samples also
7:327분 32초uh on the ter offshore apple uh to see how ter works. But by default uh this is uh basically uh protecting the hermes
7:417분 41초agent uh for uh the u expected things.
7:467분 46초So that's the security setup for the hermes agent. Uh it's good documentation. So feel free to check out
7:547분 54초the documentation to configure everything properly. then you can bypass the issues that you saw earlier with paperclip. And uh so if you have not
8:038분 3초installed paperclipip, feel free to check out my other videos. But uh set up uh paperclipip is actually pretty straightforward. So first you have to um
8:128분 12초run the paperclip uh mpx command or you can just set up everything manually and also after everything is set up manually
8:208분 20초then you can just do a paperclipip on board. So you ask you a lot of questions once that's ready. So uh you can uh be
8:278분 27초able to just uh use it uh because [snorts] there are a lot of the uh issues uh with the upgrade for
8:348분 34초paperclipip. If you have own a postgrade older version of prograde then you probably want to upgrade to a later version of postquery server. Uh for
8:428분 42초example uh if you want to run the migration script for the paper clip uh the postgrade 14 might be a problem then
8:498분 49초you have to upgrade to either uh postquery 15 or post grade 16 so forth.
8:548분 54초So then you should be able to on board the paperclip uh correctly. So there are a lot of updates for the paperclip because it's so popular. Uh so that's
9:029분 2초one thing uh I want to mention it. So once everything is ready, you should be able to
9:099분 9초run the hergent with the paper clip as you saw uh we just demo earlier in this video. So that should be it. So uh let's
9:199분 19초maybe create a sample to just try this out uh in this video. So for issues, we want to for example want to create a new issue.
9:289분 28초I want to say create a landing page for uh Gmail 4.
9:389분 38초And we want to make sure that the landing page the landing page is should be uh simple and clean.
9:509분 50초Do not overthinking and put the landing page to
9:599분 59초home research folder once completed.
10:0710분 7초So I want to make sure this is actually in progress. The priority is critical and want to assign that to the CMO or
10:1410분 14초maybe the engineer. So whichever you prefer. So and then you can uh click create issue
10:2210분 22초and you can see this is actually uh in progress and start working. So the CMO will start to work on this task and once
10:3010분 30초that's ready it should be able to put everything into the home research folder. So
10:3910분 39초so basically once that's ready you should be able to see something in the research folder. For example, we generated one in the past. So you can
10:4610분 46초see that once you um clip and paste the result and go to the HTML viewer,
10:5110분 51초something like that, you can just check out the result from the paper clip with the Hermes agent. For example, this is a
11:0011분very nice uh HTML page. So that should be it. Um so hopefully this helpful and if you like this video,
11:0911분 9초please subscribe, like or comment if you have any questions. Uh last but not least, so if you go to the Hermise agent, you can see uh the
11:1711분 17초interaction record, which is something that you talk with the purple clip and ask the agent to do. So you just go to Hermes sessions list, you can see all
11:2611분 26초the conversations that you have with the purple clip her agent. So for example for uh when you create a agent you can
11:3311분 33초see there's a uh prompt always passed into this hermit and you can do the session uh basically maybe just do
11:4111분 41초resume session you can check out the details for the conversation. So that should be it. Hopefully this helpful and if you do like this video please subscribe or comment if you have any
11:4911분 49초questions. Thank you so much for supporting channel and see you in the next one.