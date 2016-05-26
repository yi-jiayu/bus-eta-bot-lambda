"use strict";

var gulp = require('gulp');
var zip = require('gulp-zip');
var del = require('del');
var install = require('gulp-install');
var runSequence = require('run-sequence');
var awsLambda = require('node-aws-lambda');

gulp.task('clean', () => {
  return del(['./dist', './dist.zip']);
});

gulp.task('js', () => {
  return gulp.src('bot.js')
    .pipe(gulp.dest('dist/'));
});

gulp.task('strings', () => {
  return gulp.src('lib/strings.js')
    .pipe(gulp.dest('dist/lib/'));
});

gulp.task('node-mods', () => {
  return gulp.src('./package.json')
    .pipe(gulp.dest('dist/'))
    .pipe(install({production: true}));
});

gulp.task('env', () => {
  return gulp.src('./.env.json')
    .pipe(gulp.dest('dist/'));
});

gulp.task('zip', () => {
  return gulp.src(['dist/**/*', 'dist/.env.json', '!dist/package.json'], {nodir: true})
    .pipe(zip('dist.zip'))
    .pipe(gulp.dest('./'));
});

gulp.task('upload', function (callback) {
  awsLambda.deploy('./dist.zip', require("./lambda-config.js"), callback);
});

gulp.task('nodeploy', callback => {
  return runSequence(
    ['clean'],
    ['js', 'node-mods', 'env'],
    ['zip'],
    callback
  );
});

gulp.task('deploy', callback => {
  return runSequence(
    ['clean'],
    ['js', 'strings', 'node-mods', 'env'],
    ['zip'],
    ['upload'],
    callback
  );
});

gulp.task('nozip', callback => {
  return runSequence(
    ['clean'],
    ['js', 'node-mods', 'env'],
    callback
  );
});
