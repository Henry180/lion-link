const router=require("express").Router(); const Story=require("../models/Story"); const auth=require("../middleware/auth");
router.get("/",async(_,res)=>res.json({stories:await Story.find({expiresAt:{$gt:new Date()}}).populate("author","name username profileImage").sort({createdAt:-1})}));
router.post("/",auth,async(req,res)=>{if(!req.body.media?.url)return res.status(400).json({message:'Story media is required'});const story=await Story.create({author:req.user.userId,media:req.body.media});res.status(201).json({story})});
module.exports=router;
