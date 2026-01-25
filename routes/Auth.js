import express from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router=express.Router();

// Register Route

router.post('/register',async(req,res)=>{
    try {
        const {email,password}=req.body;

        if(!email || !password){
            return res.status(400).json({message:"Email ans password are required"});
        }

        const existingUser=await User.findOne({email});
        if(existingUser){
            return res.status(400).json({message:"User already exists"});
        }

        const hashedPassword=await bcrypt.hash(password,10);

        const user=new User({
            email,
           password:hashedPassword
        });
        await user.save();
        res.status(200).json({message:"User regsitered successfully"});
    } catch (error) {
        console.log("error",error);
        res.status(500).json({message:"Internal server error"});
    }
});

export default router;