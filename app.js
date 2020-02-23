require('dotenv').config({path: __dirname + '/.env'});

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const multer = require("multer");
const fsExtra = require("fs-extra");
const fs = require("fs");
const parseString = require("xml2js").parseString;
var path = require('path');
var haversine = require('haversine-distance');
var DOMParser = require('xmldom').DOMParser;
var togeojson = require("@mapbox/togeojson");

const request = require('request');
// const ejsLint = require('ejs-lint');
const mongoose = require("mongoose");

// SET STORAGE
var storage = multer.diskStorage({
    destination: function(request,file,callback){
        callback(null,""); //Uploads
    },
    filename: function(request,file,callback){
        callback(null,file.originalname); // + "-" + Date.now());
    }
});
var upload = multer ({storage:storage});

const connectionString = process.env.DATABASEURL;
// mongoose.connect("mongodb://localhost/displayGPX",{useNewUrlParser:true,useUnifiedTopology: true});
mongoose.connect(connectionString || "mongodb://localhost/displayGPX",{
    useNewUrlParser: true, 
    useUnifiedTopology: true,
    useCreateIndex:true}).then(() => {
        console.log("connected to DB!");
    }).catch(err => {
        console.log("ERROR:",err.message);
    });

app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static(__dirname + "/public"));
app.set("view engine","ejs");

console.log("Harald");
// let error_message = ejsLint("../HG_BikeCamp\views\biketrails/show.ejs");
// console.log(error_message);

app.get("/",(request,response) => {
    // response.send("Hello World");
    response.render("home");
});

app.get("/upload",(request,response) => {
    // response.send("Hello World");
    response.render("upload");
});

// upload to disc
app.post("/upload",upload.single("gpxTrack"),(request,response) => {
    console.log("hit upload Post route");
    const file = request.file.path;
    console.log("has file: ",file);
    if(!file){
        const error = new Error("Please upload a file!");
        error.httpStatusCode = 400;
        console.log(error.message);
        // return next(error);
    }
    response.render("map",{file:file});
});

// UPLOAD TO MONGO
const fileSchema = new mongoose.Schema({
    finalFile: Object
});
const File = mongoose.model("File",fileSchema);

app.post("/uploadToMongo",upload.single("fileToMongo"),(request,response) => {
    console.log("hit uploadToMongo Route");
    const file = fsExtra.readFileSync(request.file.path,'utf-8');

    let finalFile = {
        file_name: request.file.path,
        file: file
    }

    File.create({
        finalFile:finalFile
    }, (error,newFile) =>{
        if(error){
            console.log("ERROR",error.message);
            return response.redirect("/");
        }
        console.log("New File stored in Mongo: ",newFile);
    });
    response.send("File stored in MongoDB: ");
});

// get gpxTrack from MongoDB base64 file:
app.get("/map/:id",(request,response) => {
    console.log(request.params.id);
    File.findById(request.params.id,(error,result) => {
        if(error){
            console.log("ERROR WHEN CALLING FILE FROM MONGODB: ",error.message);
        }

        // console.log("foundFile: ",result);

        // let buff = new Buffer(result.finalFile.file,'base64');
        let file = result.finalFile.file; //buff.toString('ascii');
        let fileName = result.finalFile.file_name;
        let filestr = file.toString('utf-8');
        
        var gpxFile = new DOMParser().parseFromString(file);    // resultFile.file);
        var geoJSONgpx = togeojson.gpx(gpxFile);
    
        parseString(filestr,(error,result) => {
            if(error){
                console.log("Error when parsing xml string",error.message);
            }
            console.log(result);
            let json = JSON.stringify(result,null,4);
            let jsonObj = result;
    
            // write to disc file
            fs.writeFile("C:\\Users\\ehala\\Source\\WebDevelopper_ColtSteele\\DisplayGPX\\Uploads\\track.json",json,function(err){
                if(err){
                    console.log("Error in writing file: ",err.message);
                }
                
                let elevations = [];
                let coordinates = [];
                let coordinatesDict = [];
                let distances = [];

                trkPts = jsonObj.gpx.trk[0].trkseg[0].trkpt;
                trkPts.forEach((tp) => {
                    elevations.push(tp.ele[0]);
                    coordinates.push([tp.$.lat,tp.$.lon]);
                    coordinatesDict.push(tp.$);
                });
        
                // Calculate Distances:
                for (var i=1;i<coordinatesDict.length;i++){
                    var a = coordinatesDict[i];
                    var b = coordinatesDict[i-1];
                    distances.push(haversine(a,b));
                }
    
                let sumDist = [distances[0]/1000];
                for (var i=0;i<distances.length;i++){
                    sumDist.push(sumDist[i]+distances[i]/1000);
                }
    
                console.log(sumDist);
                let totalDist = 0;
                distances.map((dist) => {
                    totalDist+=dist;
                });
                console.log(totalDist);
                let negAlt = 0;
                let posAlt = 0;
                for(var i=1;i<elevations.length;i++){
                    let alt = elevations[i]-elevations[i-1];
                    if (alt>0){
                        posAlt+=alt;
                    } else {
                        negAlt+=alt;
                    }
                }
                let alt = {pos:posAlt,neg:negAlt};
                response.render("map",{sumDist:sumDist, totalDist:totalDist, alt:alt,jsonObj:jsonObj, geoJSONgpx:geoJSONgpx,file:fileName});
            });
    
        });
    });
});


app.get("/map",(request,response) => {
    // response.send("Hello World");
    response.render("map");
});


// upload and read XML file and convert to JSON format
app.post("/uploadAndRead",upload.single("fileRead"),(request,response) => {
    console.log("hit uploadAndRead Post route");
    const file = fsExtra.readFileSync(request.file.path,'utf-8');
    const filestr = file.toString("utf-8"); 

    var gpxFile = new DOMParser().parseFromString(file);
    var geoJSONgpx = togeojson.gpx(gpxFile);

    parseString(filestr,(error,result) => {
        if(error){
            console.log("Error when parsing xml string",error.message);
        }
        // console.log(result);
        let json = JSON.stringify(result,null,4);
        let jsonObj = result;
        // console.log(json);

        // write to disc file
        fs.writeFile("C:\\Users\\ehala\\Source\\WebDevelopper_ColtSteele\\DisplayGPX\\Uploads\\track.json",json,function(err){
            if(err){
                console.log("Error in writing file: ",err.message);
            }
            
            let elevations = [];
            let coordinates = [];
            let coordinatesDict = [];
            let distances = [];
            //let trkPts = JSON.stringify(jsonObj.gpx.trk[0].trkseg[0].trkpt,null,4); 
            trkPts = jsonObj.gpx.trk[0].trkseg[0].trkpt;
            trkPts.forEach((tp) => {
                elevations.push(tp.ele[0]);
                coordinates.push([tp.$.lat,tp.$.lon]);
                coordinatesDict.push(tp.$);
            });
    
            // Calculate Distances:
            for (var i=1;i<coordinatesDict.length;i++){
                var a = coordinatesDict[i];
                var b = coordinatesDict[i-1];
                distances.push(haversine(a,b));
            }

            let sumDist = [distances[0]/1000];
            for (var i=0;i<distances.length;i++){
                sumDist.push(sumDist[i]+distances[i]/1000);
            }

            console.log(sumDist);
            let totalDist = 0;
            distances.map((dist) => {
                totalDist+=dist;
            });
            console.log(totalDist);
            let negAlt = 0;
            let posAlt = 0;
            for(var i=1;i<elevations.length;i++){
                let alt = elevations[i]-elevations[i-1];
                if (alt>0){
                    posAlt+=alt;
                } else {
                    negAlt+=alt;
                }
            }
            let alt = {pos:posAlt,neg:negAlt};
            response.render("map",{sumDist:sumDist, totalDist:totalDist, alt:alt,jsonObj:jsonObj, geoJSONgpx:geoJSONgpx,file:request.file.path});
        });

    });
});




app.listen(3000,() => console.log("Server listen on port 3000"));